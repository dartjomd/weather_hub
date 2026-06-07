export class ThreeDayForecast {
    constructor() {
        this.titleElement = document.querySelector(".location-title");
        this.forecastConfig = [
            { id: "day-today", title: "Today" },
            { id: "day-tomorrow", title: "Tomorrow" },
            { id: "day-day-after", title: "Day After" }
        ];
    }

    /**
     * Render three-day forecast cards and attach click handlers
     * @param {Array} days - forecast days data
     * @param {string} service - provider subtitle
     * @param {number} activeDayIndex - index of the active day (0, 1 or 2)
     * @param {Function} onDayClick - callback fired when a day card is clicked
     */
    render(days, service, location, activeDayIndex, onDayClick) {
        if (this.titleElement && service) {
            this.titleElement.textContent = `Weather in ${location}, by ${service}`;
        }

        this.forecastConfig.forEach((config, index) => {
            const card = document.getElementById(config.id);
            const data = days[index];

            if (!card || !data) return;

            // Fill card data
            card.querySelector(".day-title").textContent = config.title;
            card.querySelector(".day-temp").textContent = data.tempRange;
            card.querySelector(".day-feel").textContent = data.condition;
            
            const iconElement = card.querySelector(".day-icon");
            if (data.icon.includes("http") || data.icon.includes("//")) {
                iconElement.innerHTML = `<img src="${data.icon}" alt="weather icon" width="45">`;
            } else {
                iconElement.textContent = data.icon;
            }

            // Toggle the active class for the selected day
            if (index === activeDayIndex) {
                card.classList.add("active");
            } else {
                card.classList.remove("active");
            }

            // Set click handler without duplicating listeners
            // Using onclick assignment avoids duplicating event listeners in this class
            card.onclick = () => {
                onDayClick(index); // Pass the day index (0, 1, 2) back to the main controller
            };
        });
    }
}