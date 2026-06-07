export class HourlyForecast {
    constructor() {
        this.container = document.querySelector(".hourly-forecast");
    }

    /**
     * Render the hourly forecast panel
     * @param {Array} hourlyData - Array of objects [{time: "12:00", temp: "+20°", icon: "..."}]
     */
    render(hourlyData) {
        if (!this.container) return;

        if (!hourlyData || hourlyData.length === 0) {
            this.container.innerHTML = `<div class="no-data">Hourly forecast unavailable</div>`;
            return;
        }

        const htmlContent = hourlyData.map(item => {
            let iconHtml = "";

            // If icon is a URL, render it as an image
            if (item.icon && (item.icon.includes("http") || item.icon.startsWith("//"))) {
                iconHtml = `<img src="${item.icon}" alt="weather icon" width="35">`;
            } else {
                iconHtml = `<span class="hourly-emoji">${item.icon || "No icon"}</span>`;
            }

            return `
                <div class="hourly-item">
                    <div class="hourly-time">${item.time}</div>
                    <div class="hourly-icon">
                        ${iconHtml}
                    </div>
                    <div class="hourly-temp">${item.temp}</div>
                </div>
            `;
        }).join("");

        this.container.innerHTML = htmlContent;
    }
}