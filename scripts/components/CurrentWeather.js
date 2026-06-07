export default class CurrentWeather {
    constructor() {
        this.container = document.querySelector('.current-weather-hero-wrapper');
    }

    render(data, temp) {
        if (!this.container) {
            console.error("CurrentWeather container not found");
            return;
        }

        if (!data) {
            this.container.innerHTML = `<p class="error-msg">Weather data unavailable</p>`;
            return;
        }

        this.container.innerHTML = `
        <div class="current-weather-hero weather-${data.type}">
            <div class="current-main">
                <h1 class="current-temp">${temp}</h1>
                <p class="current-desc">${data.desc}</p>
            </div>
            <div class="current-details">
                <div class="detail-item">
                    <span class="icon">💨</span> 
                    <span>${data.wind} m/s</span>
                </div>
                <div class="detail-item">
                    <span class="icon">💧</span> 
                    <span>${data.humidity}%</span>
                </div>
            </div>        
        </div>
        `;
    }
}