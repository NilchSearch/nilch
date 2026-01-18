const urlParams = new URLSearchParams(window.location.search);
const safeSearch = urlParams.get('safe') || "strict";
const query = urlParams.get('q');
const encodedQuery = encodeURIComponent(query);
const page = parseInt(urlParams.get('page') || "0");

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

function createPagination(totalPages = 9, currentPage = page) {
    const container = document.createElement("div");
    container.className = "pagination-container";
    const list = document.createElement("ul");
    list.className = "pagination";
    for (let i = 0; i <= totalPages; i++) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = window.location.href + "&page=" + i;
        a.textContent = i + 1;
        a.className = "page-btn";
        if (i === currentPage) {
            a.classList.add("active");
        }
        li.appendChild(a);
        list.appendChild(li);
    }
    container.appendChild(list);
    const results = document.getElementById("videoResults");
    results.insertAdjacentElement("afterend", container);
}

// Wrap all async code in an IIFE
(async function() {
    try {
        const url = "https://unmappedstack.pythonanywhere.com/api/search?videos=true&q=" + encodedQuery
                        + "&safe=" + safeSearch + "&page=" + page;
        const resultsResponse = await getUrlContents(url);
        if (resultsResponse == "noquery") {
            document.getElementById("results").innerHTML = '<p>There was an error, please try again: noquery</p>';
            return;
        } else if (resultsResponse == "noresults") {
            document.location.reload();
        }
        const resultsData = JSON.parse(resultsResponse).results; // Parse the JSON string
        const results = document.getElementById("results");
        
        const container = document.getElementById("videoResults");
        container.innerHTML = "";
       
        resultsData.forEach(video => {
            const card = document.createElement("a");
            card.className = "video-card";
            card.href = video.content || "#";
            card.target = "_blank";
        
            // Thumbnail (safe fallback)
            const thumbSrc = video.images.large
                ? video.images.large
                : "data:image/svg+xml;charset=UTF-8," +
                  encodeURIComponent(`<svg width='160' height='90' xmlns='http://www.w3.org/2000/svg'>
                      <rect width='160' height='90' fill='#333'/>
                      <text x='50%' y='50%' fill='#aaa' font-size='14' text-anchor='middle' dy='.3em'>No Thumbnail</text>
                   </svg>`);
        
            const img = document.createElement("img");
            img.className = "video-thumb";
            img.src = thumbSrc;
        
            const info = document.createElement("div");
            info.className = "video-info";
        
            const titleText = video.title || "Untitled Video";
            const title = document.createElement("div");
            title.className = "video-title";
            title.textContent = titleText;
        
            const creator = video.uploader || "Unknown Creator";
            const publisher = video.publisher || "Unknown Platform";
        
            const meta = document.createElement("div");
            meta.className = "video-meta";
            meta.textContent = `${creator} • ${publisher}`;
        
            info.appendChild(title);
            info.appendChild(meta);
        
            card.appendChild(img);
            card.appendChild(info);
        
            container.appendChild(card);
        });
        createPagination();
    } catch (error) {
        console.error('Error loading search results:', error);
        document.getElementById("results").innerHTML = '<p>Error loading search results. Please try again.<br>' + error + '</p>';
    }
})();

if (query) {
    document.title = query + " | nilch";
    document.getElementById('searchInput').value = query;
    document.getElementById('imagesTab').href = 'images.html?q=' + encodeURIComponent(query);
    document.getElementById('webTab').href = 'results.html?q=' + encodeURIComponent(query);
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
