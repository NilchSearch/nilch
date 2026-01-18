const urlParams = new URLSearchParams(window.location.search);
const safeSearch = urlParams.get('safe') || "strict";
const query = urlParams.get('q');
const failed = urlParams.get('failed') || "false";
const encodedQuery = encodeURIComponent(query);
const page = parseInt(urlParams.get('page') || "0");
const language = urlParams.get('lang') || "en-GB";
const engine = urlParams.get('engine') || "duckduckgo";

async function getUrlContents(url) {
    const response = await fetch(url);
    return await response.text();
}

function toggleTheme() {
    const body = document.body;
    const button = document.querySelector('.theme-toggle');
    body.classList.toggle('light-mode');
    
    if (body.classList.contains('light-mode')) {
        button.innerHTML = '<i class="bi bi-sun"></i>';
        localStorage.setItem('theme', 'light');
    } else {
        button.innerHTML = '<i class="bi bi-moon"></i>';
        localStorage.setItem('theme', 'dark');
    }
}

// Load saved theme
if (localStorage.getItem('theme') === 'light' || window.matchMedia('(prefers-color-scheme: light)').matches) {
    document.body.classList.add('light-mode');
    document.querySelector('.theme-toggle').innerHTML = '<i class="bi bi-sun"></i>';
}

function matchBang(query) {
    const bangMatch = query.match(/^!([a-zA-Z]+)(?:\s(.*))?$/);
    if (bangMatch) {
        const cmd = bangMatch[1];
        const search = bangMatch[2] || "";
        const result = bangs.find(item => item.t === cmd);
        if (result !== undefined) {
            if (search == "") {
                window.location.href = "https://" + result.d;
            } else {
                const querySymbol = "{" + "{" + "{s}" + "}" + "}";
                window.location.href = result.u.replace(querySymbol, encodeURIComponent(search));
            }
            return true;
        }
    }
    return false;
}

function handleSearch(e) {
    e.preventDefault();
    const query = document.getElementById('searchInput').value.trim();
    if (query) {
        if (matchBang(query)) {
            return false;
        }
        window.location.href = '?q=' + encodeURIComponent(query);
    }
    return false;
}

function changeLanguage() {
    const select = document.getElementById('languageSelect');
    const newLang = select.value;
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('lang', newLang);
    window.location.href = window.location.pathname + '?' + urlParams.toString();
}

function changeEngine() {
    const select = document.getElementById('engineSelect');
    const newEngine = select.value;
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('engine', newEngine);
    window.location.href = window.location.pathname + '?' + urlParams.toString();
}

function createPagination(totalPages = 9, currentPage = page) {
    const container = document.createElement("div");
    container.className = "pagination-container";
    const list = document.createElement("ul");
    list.className = "pagination";
    for (let i = 0; i <= totalPages; i++) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        let url = new URLSearchParams(window.location.search);
        url.set("page", i);
        a.href = "?" + url.toString();
        a.textContent = i + 1;
        a.className = "page-btn";
        if (i === currentPage) {
            a.classList.add("active");
        }
        li.appendChild(a);
        list.appendChild(li);
    }
    container.appendChild(list);
    const results = document.getElementById("results");
    results.insertAdjacentElement("afterend", container);
}

// Wrap all async code in an IIFE
(async function() {
    try {
        const url = "https://unmappedstack.pythonanywhere.com/api/search?q=" + encodedQuery
                        + "&safe=" + safeSearch + "&page=" + page + "&language=" + language + "&engine=" + engine;
        const resultsResponse = await getUrlContents(url);
        if (resultsResponse == "noquery") {
            document.getElementById("results").innerHTML = '<p>There was an error, please try again: noquery</p>';
            return;
        } else if (resultsResponse == "noresults") {
            if (failed == "true") {
                document.getElementById("results").innerHTML = "<h1>Woah!</h1><p>nilch has been getting unexpected amounts of traffic, thousands of searches within an hour or two! Unfortunately, this means API limits have been surpassed. <br><br><b>This should be fixed within one day</b>.</p><br><a href='https://duckduckgo.com/" + encodeURIComponent(query) + "'>Search the same query on DuckDuckGo</a> until then?";
                return;
                return;
            } else {
                window.location.url = window.location.url + "&failed=true";
            }
        }
        const resultsData = JSON.parse(resultsResponse);
        const searchResults = resultsData.results;
        const infoboxData = (resultsData.infobox == "null") ? null : resultsData.infobox;
        const results = document.getElementById("results");
        const infobox = document.getElementById("infobox");
        results.innerHTML = "";
        if (searchResults.length == 0) {
            results.innerHTML = "There weren't any results found! Maybe try switching to another engine?";
            return;
        }
        for (let result = 0; result < searchResults.length; result++) {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'result';
            
            const titleDiv = document.createElement('div');
            titleDiv.className = 'result-title';
            const link = document.createElement('a');
            link.href = searchResults[result].href;
            const rawTitle = searchResults[result].title;
            link.textContent = rawTitle.length > 60
              ? rawTitle.slice(0, 60) + "..." 
              : rawTitle;
            titleDiv.appendChild(link);
            
            const urlDiv = document.createElement('div');
            urlDiv.className = 'result-url';
            
            const favicon = document.createElement('img');
            favicon.className = 'result-favicon';
            let urlObj = new URL(searchResults[result].href);
            favicon.src = "https://icons.duckduckgo.com/ip3/" + urlObj.hostname + ".ico";
            urlDiv.appendChild(favicon);
            
            const urlText = document.createElement('span');
            urlText.textContent = searchResults[result].href;
            urlDiv.appendChild(urlText);
            
            const snippetDiv = document.createElement('div');
            snippetDiv.className = 'result-snippet';
            const rawDescription = searchResults[result].body;
            snippetDiv.innerHTML = rawDescription.length > 300 
              ? rawDescription.slice(0, 300) + "..." 
              : rawDescription;
            
            if (searchResults[result].page_age) {
                const dateDiv = document.createElement('div');
                dateDiv.className = 'result-date';
                dateDiv.textContent = "PUBLISHED " + searchResults[result].page_age.split("T")[0];
                resultDiv.appendChild(dateDiv);
            }

            resultDiv.appendChild(titleDiv);
            resultDiv.appendChild(urlDiv);
            resultDiv.appendChild(snippetDiv);
            results.appendChild(resultDiv);
        }
        createPagination();
        
        if (infoboxData) {
            infobox.style.display = "block";
            const title = document.getElementById("infobox-title");
            
            if (infoboxData.infotype == "calc") {
                title.innerHTML = "Calculator";
                const itemDiv = document.createElement('div');
                itemDiv.className = "infobox-item";
                const labelDiv = document.createElement('div');
                labelDiv.className = "infobox-label";
                labelDiv.innerHTML = infoboxData.equ + " =";
                itemDiv.appendChild(labelDiv);
                const answerDiv = document.createElement('div');
                answerDiv.innerHTML = "<h2>" + infoboxData.result + "</h2>";
                itemDiv.appendChild(answerDiv);
                infobox.appendChild(itemDiv);
            } else if (infoboxData.infotype == "definition") {
                title.innerHTML = "Dictionary";
                const itemDiv = document.createElement('div');
                itemDiv.className = "infobox-item";
                const wordDiv = document.createElement('div');
                wordDiv.innerHTML = "<h2>" + infoboxData.word + "</h2>";
                itemDiv.appendChild(wordDiv);
                const typeDiv = document.createElement('div');
                typeDiv.className = "infobox-label";
                typeDiv.innerHTML = infoboxData.type;
                itemDiv.appendChild(typeDiv);
                const definitionDiv = document.createElement('div');
                definitionDiv.innerHTML = infoboxData.definition;
                itemDiv.appendChild(definitionDiv);
                const linkDiv = document.createElement('b');
                linkDiv.innerHTML = "<br>There may be more definitions, see them all at <a href='" + infoboxData.url + "'>Wiktionary</a>";
                itemDiv.appendChild(linkDiv);
                infobox.appendChild(itemDiv);
            } else if (infoboxData.infotype == "wikipedia") {
                title.innerHTML = infoboxData.title;
                const itemDiv = document.createElement('div');
                itemDiv.className = "infobox-item";
                const infoDiv = document.createElement('div');
                infoDiv.innerHTML = infoboxData.info;
                itemDiv.appendChild(infoDiv);
                const linkDiv = document.createElement('div');
                linkDiv.style.marginTop = "10px";
                const link = document.createElement('a');
                link.href = infoboxData.url;
                link.textContent = "Read more on Wikipedia";
                link.target = "_blank";
                linkDiv.appendChild(link);
                itemDiv.appendChild(linkDiv);
                infobox.appendChild(itemDiv);
            }
        }
    } catch (error) {
        console.error('Error loading search results:', error);
        document.getElementById("results").innerHTML = '<p>Error loading search results. Please try again.<br>' + error + '</p>';
    }
})();
 
if (query) {
    document.title = query + " | nilch";
    document.getElementById('searchInput').value = query;
    document.getElementById('imagesTab').href = 'images.html?q=' + encodeURIComponent(query);
    document.getElementById('videosTab').href = 'videos.html?q=' + encodeURIComponent(query);
    document.getElementById('mapsTab').href = 'https://duck.com/?iaxm=maps&q=' + encodeURIComponent(query);
}

if (document.getElementById('searchInput').value.trim()) {
    matchBang(query);
}

function toggleSafeSearch() {
    const urlParams = new URLSearchParams(window.location.search);
    const current = urlParams.get('safe') || 'strict';
    const newValue = current === 'strict' ? 'off' : 'strict';
    urlParams.set('safe', newValue);
    window.location.href = window.location.pathname + '?' + urlParams.toString();
}

(function updateSafeButton() {
    const urlParams = new URLSearchParams(window.location.search);
    const safeButton = document.querySelector('.safe-toggle');
    if (!safeButton) return;
    const safeStatus = urlParams.get('safe') || 'strict';
    safeButton.textContent = 'Safe Search: ' + (safeStatus === 'strict' ? 'On' : 'Off');
})();

// Set dropdowns to current value
(function updateLanguageSelect() {
    const select = document.getElementById('languageSelect');
    if (select) {
        select.value = language;
    }
})();
(function updateEngineSelect() {
    const select = document.getElementById('engineSelect');
    if (select) {
        select.value = engine;
    }
})();
