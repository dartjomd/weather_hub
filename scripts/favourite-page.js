document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("favorites-page-list");
    if (!container) return;

    // Read favorites array from localStorage
    const savedFavorites = localStorage.getItem("weatherFavorites");
    const favorites = savedFavorites ? JSON.parse(savedFavorites) : [];

    // If no favorites exist, show an empty message
    if (favorites.length === 0) {
        container.innerHTML = `<p class="empty-message">Your favorites list is empty. Add locations using the button on the weather page.</p>`;
    }
    else {
        favorites.forEach(city => {
            const card = document.createElement("a");

            // Clicking the card sends the user to the main page with the city in the URL
            card.href = `/index.html?city=${encodeURIComponent(city)}`;
            card.className = "fav-page-item";
            card.textContent = city;

            container.appendChild(card);
        });
    }

    // Setup the search field on this page and redirect to the main page with the city
    const searchForm = document.querySelector(".search-form");
    const searchInput = document.querySelector(".search-input");

    if (searchForm && searchInput) {
        searchForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const query = searchInput.value.trim();
            if (query) {
                window.location.href = `/index.html?city=${encodeURIComponent(query)}`;
            }
        });
    }
});