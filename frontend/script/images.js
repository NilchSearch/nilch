const urlParams = new URLSearchParams(window.location.search);
const safeSearch = urlParams.get('safe') || "strict";
const query = urlParams.get('q');
const encodedQuery = encodeURIComponent(query);
const results = document.getElementById("results");

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

function handleSearch(e) {
    e.preventDefault();
    const query = document.getElementById('searchInput').value.trim();
    if (query) {
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
                return false;
            }
        }
        window.location.href = '?q=' + encodeURIComponent(query);
    }
    return false;
}

// Wrap async code in IIFE
(async function() {
    try {
        const url = "https://unmappedstack.pythonanywhere.com/api/images?q=" + encodedQuery
                        + "&safe=" + safeSearch;
        const response = await getUrlContents(url);
        if (response == "noquery") {
            document.getElementById("results").innerHTML = '<p>There was an error, please try again: noquery</p>';
            return;
        } else if (response == "noresults") {
            document.getElementById("results").innerHTML = '<p>There was an error, please try again: noresults</p>';
            return;
        }
        const searchResults = JSON.parse(response);
        
        for (let result = 0; result < searchResults.length; result++) {
            const imageItem = document.createElement('div');
            imageItem.className = 'image-item';
            const link = document.createElement('a');
            link.href = searchResults[result].image;
            const imageWrapper = document.createElement('div');
            imageWrapper.className = 'image-wrapper';
            const img = document.createElement('img');
            img.src = searchResults[result].image;
            img.onerror = function() {
                this.closest(".image-item").remove();
            };
            imageWrapper.appendChild(img);
            link.appendChild(imageWrapper);
            imageItem.appendChild(link);
            const targetElement = document.getElementById('results');
            targetElement.appendChild(imageItem);
        }
        document.getElementById("loading").innerText = "";
    } catch (error) {
        console.error('Error loading images:', error);
        results.innerHTML = '<p>Error loading images. Please try again.</p>';
    }
})();

if (query) {
    document.title = query + " | nilch";
    document.getElementById('searchInput').value = query;
    document.getElementById('webTab').href = 'results.html?q=' + encodeURIComponent(query);
    document.getElementById('videosTab').href = 'videos.html?q=' + encodeURIComponent(query);
    document.getElementById('mapsTab').href = 'https://duck.com/?iaxm=maps&q=' + encodeURIComponent(query);
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
