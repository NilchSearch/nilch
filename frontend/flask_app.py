"""
Main application module for the Search API.

This module initializes the Flask application, configures CORS, and wires together
the domain services (PersistentCache, BraveClient, InfoboxResolver) to handle
search and image requests asynchronously.
"""

import os
import re
import json
import time
import sqlite3
import hashlib
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Optional, Union, Any, TypedDict, cast, Literal

import requests
from requests.exceptions import RequestException
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

# --
# Configuration & Constants
# --

# Persistence configuration
DB_PATH: str = "search_cache.db"
CACHE_CAPACITY: int = 1000

# Add your keys (can have multiple)
BRAVE_SEARCH_API_KEYS: List[str] = []

BRAVE_SEARCH_API_HEADERS: Dict[str, str] = {
    "Accept": "application/json",
    "Accept-Encoding": "gzip",
    "X-Subscription-Token": "setme"  # Set later by the calling function
}

WIKIPEDIA_API_HEADERS: Dict[str, str] = {
    "User-Agent": "nilch/1.0 (jake.stbu@gmail.com)"
}

# Whitelist strategy: Configure allowed frontend origins here.
# loads from env var ALLOWED_ORIGINS (comma separated) or defaults to localhost
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
CORS_ORIGINS: List[str] = [origin.strip() for origin in _raw_origins.split(",")]

REQUEST_TIMEOUT: int = 10  # Seconds

# Global executor for offloading blocking I/O
IO_EXECUTOR = ThreadPoolExecutor(max_workers=4)

# --
# Type Definitions
# --

class SearchResultItem(TypedDict):
    """Schema for a single web search result item."""
    title: str
    url: str
    description: Optional[str]

class ImageResultItem(TypedDict):
    """Schema for a single image search result item."""
    url: str
    img: str

class InfoboxData(TypedDict, total=False):
    """Schema for the instant answer/infobox data."""
    infotype: str
    equ: Optional[str]
    result: Optional[str]
    word: Optional[str]
    type: Optional[str]
    definition: Optional[str]
    url: Optional[str]
    title: Optional[str]
    info: Optional[str]

# Discriminator for cache key generation
CacheCategory = Literal["web", "videos", "images"]

# --
# Domain Services
# --

class PersistentCache:
    """
    Manages persistent caching using SQLite to survive process restarts.
    Replaces the previous in-memory list to solve data loss and performance issues.
    """
    def __init__(self, db_path: str, capacity: int) -> None:
        self._db_path = db_path
        self._capacity = capacity
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        """Creates a fresh connection for the thread context."""
        return sqlite3.connect(self._db_path)

    def _init_db(self) -> None:
        """
        Initializes the SQLite schema with WAL mode for concurrency.
        """
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS cache (
                    key TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    last_accessed REAL NOT NULL
                )
            """)
            # Index vital for O(1) eviction performance
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_last_accessed ON cache(last_accessed)
            """)

    def _generate_key(self, query: str, safe: str, category: CacheCategory, page: int) -> str:
        """Generates a deterministic hash key for the cache entry."""
        raw_key = f"{category}|{safe}|{page}|{query}"
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    def get(self, query: str, safe: str, category: CacheCategory, page: int = 0) -> Optional[Any]:
        """
        Retrieves data from SQLite. Updates last_accessed for LRU policy.
        """
        key = self._generate_key(query, safe, category, page)
        try:
            with self._get_connection() as conn:
                cursor = conn.execute("SELECT data FROM cache WHERE key = ?", (key,))
                row = cursor.fetchone()
                if row:
                    # Update timestamp to prevent eviction
                    conn.execute(
                        "UPDATE cache SET last_accessed = ? WHERE key = ?",
                        (time.time(), key)
                    )
                    return json.loads(row[0])
        except sqlite3.Error:
            pass  # Fail open on DB errors
        return None

    def add(self, query: str, safe: str, category: CacheCategory, page: int, data: Any) -> None:
        """
        Persists data and enforces capacity limits using SQL-optimized deletion.
        """
        key = self._generate_key(query, safe, category, page)
        serialized = json.dumps(data)
        now = time.time()

        try:
            with self._get_connection() as conn:
                # Upsert the new entry
                conn.execute(
                    """
                    INSERT OR REPLACE INTO cache (key, data, created_at, last_accessed) 
                    VALUES (?, ?, ?, ?)
                    """,
                    (key, serialized, now, now)
                )

                # O(1) Amortized Eviction:
                # Selects rows that fall outside the capacity window (ordered by time)
                # and deletes them. Uses the index on last_accessed.
                conn.execute(
                    """
                    DELETE FROM cache WHERE rowid IN (
                        SELECT rowid FROM cache 
                        ORDER BY last_accessed DESC 
                        LIMIT -1 OFFSET ?
                    )
                    """,
                    (self._capacity,)
                )
        except sqlite3.Error:
            pass

class BraveClient:
    """
    Encapsulates interactions with the Brave Search API.
    Handles token rotation and network error states.
    """
    def __init__(self, api_keys: List[str], headers: Dict[str, str]) -> None:
        self._api_keys = api_keys
        self._headers = headers.copy()

    def _make_request(self, url: str, params: Dict[str, Any]) -> Optional[requests.Response]:
        """
        Executes an HTTP GET request, rotating through API keys if rate limited.
        """
        if not self._api_keys:
            return None

        for key in self._api_keys:
            current_headers = self._headers.copy()
            current_headers["X-Subscription-Token"] = key
            try:
                response = requests.get(
                    url,
                    headers=current_headers,
                    params=params,
                    timeout=REQUEST_TIMEOUT
                )
                if response.status_code == 200:
                    return response
                # checks for 429 specifically to continue to next key
                if response.status_code == 429:
                    continue
            except RequestException:
                continue
        return None

    def get_web_results(
        self,
        query: str,
        safe_search: str,
        is_videos: bool,
        page: int
    ) -> Optional[List[Any]]:
        """Fetches web or video results from Brave Search."""
        result_type = "videos" if is_videos else "web"
        url = f"https://api.search.brave.com/res/v1/{result_type}/search"
        params = {"q": query, "safesearch": safe_search, "count": 10, "offset": page}

        response = self._make_request(url, params)
        if response is not None and response.status_code == 200:
            json_data = response.json()
            if is_videos:
                return cast(List[Any], json_data.get("results", []))
            return cast(List[Any], json_data.get("web", {}).get("results", []))
        return None

    def get_img_results(
        self,
        query: str,
        safe_search: str
    ) -> Optional[List[ImageResultItem]]:
        """Fetches image results from Brave Search."""
        url = "https://api.search.brave.com/res/v1/images/search"
        params = {"q": query, "safesearch": safe_search}

        response = self._make_request(url, params)
        if response is not None and response.status_code == 200:
            raw_results = response.json().get("results", [])
            # transforms raw results into strict schema
            return [
                {"url": item["url"], "img": item["thumbnail"]["src"]}
                for item in raw_results
                if "thumbnail" in item
            ]
        return None

class InfoboxResolver:
    """
    Parses queries to provide instant answers (calculations, definitions, wikipedia).
    """
    def get_infobox(self, web_results: List[Any], query: str) -> Optional[InfoboxData]:
        """
        Determines if an infobox should be displayed based on query patterns.
        """
        # attempts to solve math expressions first
        math_result = self._solve_math(query)
        if math_result:
            return math_result

        # attempts to find a dictionary definition
        def_result = self._get_definition(query)
        if def_result:
            return def_result

        # falls back to wikipedia summary from results
        return self._get_wikipedia_summary(web_results)

    def _solve_math(self, query: str) -> Optional[InfoboxData]:
        """Evaluates simple mathematical expressions found in the query."""
        if len(query) > 100:
            return None

        expr_pattern = r'[+\-/*÷x()0-9.^ ]+'
        maths_patterns = [
            rf'^what is ({expr_pattern})$',
            rf'^solve ({expr_pattern})$',
            rf'^calc ({expr_pattern})$',
            rf'^calculate ({expr_pattern})$',
            rf'^({expr_pattern})$',
            rf'^({expr_pattern})=$',
        ]
        for pattern in maths_patterns:
            match = re.match(pattern, query, re.IGNORECASE)
            if match:
                equ = match.group(1).strip()
                # sanitizes operators for python evaluation
                equ_clean = equ.replace("x", "*").replace("÷", "/").replace("^", "**")

                # Strict whitelist check before eval
                if not re.match(r'^[0-9+\-/*().\s]+$', equ_clean):
                    continue

                try:
                    # evaluates safely by restricting globals
                    # pylint: disable=eval-used
                    result = str(eval(equ_clean, {"__builtins__": None}, {}))
                    return {"infotype": "calc", "equ": equ_clean, "result": result}
                except (SyntaxError, ZeroDivisionError, NameError, TypeError, ValueError):
                    return None
        return None

    def _get_definition(self, query: str) -> Optional[InfoboxData]:
        """Checks if the query is asking for a word definition."""
        def_match0 = re.match(r'^what does ([a-zA-Z]+) mean$', query, re.IGNORECASE)
        def_match1 = re.match(r'^define ([a-zA-Z]+)$', query, re.IGNORECASE)

        word: Optional[str] = None
        if def_match0:
            word = def_match0.group(1)
        elif def_match1:
            word = def_match1.group(1)

        if word is not None:
            url = f"https://en.wiktionary.org/api/rest_v1/page/definition/{word}"
            try:
                response = requests.get(url, headers=WIKIPEDIA_API_HEADERS, timeout=REQUEST_TIMEOUT)
                if response.status_code != 200:
                    return None
                data = response.json()

                definition: Optional[str] = None
                if "en" in data and len(data["en"]) > 0:
                    for d in data["en"][0].get("definitions", []):
                        if d.get("definition"):
                            definition = d["definition"]
                            break

                    return {
                        "word": word,
                        "type": data["en"][0].get("partOfSpeech"),
                        "definition": definition,
                        "url": f"https://en.wiktionary.org/wiki/{word}",
                        "infotype": "definition"
                    }
            except RequestException:
                return None
        return None

    def _get_wikipedia_summary(self, web_results: List[Any]) -> Optional[InfoboxData]:
        """Extracts a Wikipedia summary if a Wikipedia link appears in the top results."""
        # scans up to 3 results for a wikipedia link
        for i in range(min(3, len(web_results))):
            res_url = web_results[i].get("url", "")
            if "wikipedia.org" in res_url:
                title_part = web_results[i].get("title", "").split(" - Wikipedia")[0]
                formatted_title = title_part.replace(" ", "_")
                url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{formatted_title}"

                try:
                    response = requests.get(
                        url,
                        headers=WIKIPEDIA_API_HEADERS,
                        timeout=REQUEST_TIMEOUT
                    )
                    if response.status_code != 200:
                        continue
                    data = response.json()
                    return {
                        "title": data.get("title"),
                        "info": data.get("extract"),
                        "url": data.get("content_urls", {}).get("desktop", {}).get("page"),
                        "infotype": "wikipedia"
                    }
                except RequestException:
                    continue
        return None

# --
# Application Factory
# --

def create_app() -> Flask:
    """
    Constructs the Flask application instance and registers middleware.
    """
    # initializes the flask application
    application = Flask(__name__)

    # applies cors to allow the specific origins defined in configuration
    # supports_credentials=True ensures cookies/headers pass correctly for the whitelisted domains
    CORS(application, origins=CORS_ORIGINS, supports_credentials=True)

    return application

app = create_app()

# --
# Dependency Injection
# --

search_cache = PersistentCache(DB_PATH, CACHE_CAPACITY)
brave_client = BraveClient(BRAVE_SEARCH_API_KEYS, BRAVE_SEARCH_API_HEADERS)
infobox_resolver = InfoboxResolver()

# --
# Async Helpers
# --

async def run_sync(func: Any, *args: Any, **kwargs: Any) -> Any:
    """
    Runs a blocking synchronous function in a thread pool to avoid blocking
    the main event loop.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(IO_EXECUTOR, lambda: func(*args, **kwargs))

# --
# Route Handlers
# --

@app.route("/api/search", methods=["GET"])
async def results() -> Union[Response, str, Dict[str, Any]]:
    """
    Handle search requests asynchronously.
    Query Params: q (query), safe (strict/moderate/off), videos (true/false), page (int)
    """
    # extracts query parameters with strict checks
    query = request.args.get("q")
    safe_search_arg = request.args.get("safe")
    videos_arg = request.args.get("videos")
    page_arg = request.args.get("page")

    # fails fast if query is missing
    if query is None:
        return jsonify({"error": "noquery"})

    safe_search = safe_search_arg if safe_search_arg is not None else "strict"
    is_videos = videos_arg == "true"
    category: CacheCategory = "videos" if is_videos else "web"

    try:
        page = int(page_arg) if page_arg is not None else 0
    except ValueError:
        page = 0

    # checks the cache first (DB ops in thread)
    cached_results = await run_sync(search_cache.get, query, safe_search, category, page)
    if cached_results is not None:
        results_list = cached_results
    else:
        # fetch from upstream (Network ops in thread)
        fetched_results = await run_sync(
            brave_client.get_web_results,
            query,
            safe_search,
            is_videos,
            page
        )
        if fetched_results is not None:
            results_list = fetched_results
            await run_sync(search_cache.add, query, safe_search, category, page, results_list)
        else:
            # Return empty structure instead of string to maintain JSON contract
            return jsonify({"results": [], "infobox": None})

    # resolves infobox if applicable
    infobox: Optional[InfoboxData] = None
    if not is_videos:
        infobox = await run_sync(infobox_resolver.get_infobox, results_list, query)

    # normalizes null for JSON compatibility
    if infobox is not None:
        final_infobox: Union[InfoboxData, str] = infobox
    else:
        # type ignore used because 'null' string is a legacy requirement for the frontend
        final_infobox = "null"  # type: ignore

    return {
        "infobox": final_infobox,
        "results": results_list,
    }

@app.route("/api/images", methods=["GET"])
async def images() -> Union[Response, str, List[ImageResultItem]]:
    """
    Handle image search requests asynchronously.
    Now includes caching to prevent Billing Drain.
    Query Params: q (query), safe (strict/moderate/off)
    """
    query = request.args.get("q")
    safe_search_arg = request.args.get("safe")

    if query is None:
        return jsonify({"error": "noquery"})

    safe_search = safe_search_arg if safe_search_arg is not None else "strict"
    category: CacheCategory = "images"

    # Check cache first
    cached_results = await run_sync(search_cache.get, query, safe_search, category, 0)
    if cached_results is not None:
        return jsonify(cast(List[ImageResultItem], cached_results))

    # Fetch from upstream
    fetched_results = await run_sync(brave_client.get_img_results, query, safe_search)

    if fetched_results is None:
        return jsonify([])

    # Store in cache
    await run_sync(search_cache.add, query, safe_search, category, 0, fetched_results)

    return jsonify(fetched_results)

# --
# Entry Point
# --

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
