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
        window.location.href = 'results.html?q=' + encodeURIComponent(query);
    }
    return false;
}
