import { WeatherServices } from "./WeatherServices.js";
import { ThreeDayForecast } from "./components/ThreeDayForecast.js";
import { HourlyForecast } from "./components/HourlyForecast.js";
import { WeatherCharts } from './components/WeatherCharts.js';
import CurrentWeather from "./components/CurrentWeather.js";

class AppController {
    constructor() {
        this.services = new WeatherServices();
        this.threeDayComponent = new ThreeDayForecast();
        this.hourlyComponent = new HourlyForecast();
        this.weatherCharts = new WeatherCharts();
        this.currentWeather = new CurrentWeather();

        this.currentProvider = "OpenMeteo";
        this.currentLat = 60.9827;
        this.currentLon = 25.6615;
        this.currentDayIndex = 0;
        this.currentRequestId = 0;
        this.city = 'Lahti';
        this.currentUnit = "C";
        this.favorites = [];

        this.activeChartProviders = {
            OpenMeteo: true,
            WeatherAPI: true,
            OpenWeatherMap: true,
        };
    }

    async init() {
        this.#initAsyncVariables();
        this.#initEvents();

        // If a city was passed in the URL, try to resolve its coordinates
        if (this.city && this.city !== 'Lahti') {
            await this.#updateLocationByCityName(this.city);
        }

        // If the URL city cannot be resolved, keep the default
        // Update the search input with the current city
        const searchInput = document.querySelector(".search-input");
        if (searchInput) searchInput.value = this.city;

        await this.updateWeatherDisplay();
    }

    async #updateLocationByCityName(cityName) {
        try {
            const geoResult = await this.services.getCoordinatesByCityName(cityName);
            if (geoResult) {
                this.currentLat = geoResult.lat;
                this.currentLon = geoResult.lon;
                this.city = geoResult.fullName.split(',')[0];
                return true;
            }
        } catch (err) {
            console.error("Geocoding failed:", err);
        }
        return false;
    }

    #initAsyncVariables() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('provider')) this.currentProvider = urlParams.get('provider');
        if (urlParams.get('city')) this.city = urlParams.get('city');

        const savedUnit = localStorage.getItem("weatherUnit");
        this.currentUnit = (savedUnit === "C" || savedUnit === "F") ? savedUnit : "C";

        const savedFavorites = localStorage.getItem("weatherFavorites");
        this.favorites = savedFavorites ? JSON.parse(savedFavorites) : [];
    }

    async updateWeatherDisplay(rerenderCharts=true) {
        this.currentRequestId++;
        const requestId = this.currentRequestId;

        try {
            // Fetch all provider data and wait for completion
            await this.#preloadAllProvidersCache();

            // Race condition check: if another request came in while we were awaiting, discard this result
            if (requestId !== this.currentRequestId) return;

            const cachedItem = this.services.getCachedData(this.currentProvider, this.currentLat, this.currentLon);

            if (!cachedItem || !cachedItem.data) {
                return;
            }

            const adaptedData = this.services.normalizeData(this.currentProvider, cachedItem.data);
            const displayDays = this.#formatDataTemperatureType(adaptedData);
            const currentData = adaptedData.current
            

            this.threeDayComponent.render(displayDays, adaptedData.service, this.city, this.currentDayIndex, (idx) => this.#handleDayChange(idx, adaptedData));
            this.hourlyComponent.render(displayDays[this.currentDayIndex]?.hourly || []);
            this.currentWeather.render(currentData, this.#formatTemp(currentData.temp));
            
            if (rerenderCharts) {
                this.#loadAndRender7DayCharts();
            }
            
            this.#updateUrlAndUI();
        } catch (err) {
            console.error("Dashboard orchestration crashed:", err);
        }
    }

    #loadAndRender7DayCharts() {
        try {
            const chartData = this.services.get7DayChartsData(this.activeChartProviders, this.currentLat, this.currentLon);
            // Pass the current unit to WeatherCharts
            this.weatherCharts.render(this.currentUnit, this.activeChartProviders, chartData);
        } catch (e) {
            console.error("Charts orchestration crashed:", e);
        }
    }

    #formatDataTemperatureType(data) {
        return data.days.map(day => ({
            ...day,
            tempRange: this.#formatTemp(day.tempRange),
            hourly: day.hourly.map(h => ({ ...h, temp: this.#formatTemp(h.temp) }))
        }));
    }

    #formatTemp(tempStr) {
        if (this.currentUnit === "C" || !tempStr) return tempStr;
        return tempStr.replace(/([+-]?\d+)(°)/g, (match, number) => {
            const f = Math.round(parseInt(number, 10) * 1.8 + 32);
            return `${f > 0 ? '+' : ''}${f}°F`;
        });
    }

    #handleDayChange(newDayIndex, adaptedData) {
        this.currentDayIndex = newDayIndex;
        const displayDays = this.#formatDataTemperatureType(adaptedData);
        this.threeDayComponent.render(displayDays, adaptedData.service, this.city, this.currentDayIndex, (idx) => this.#handleDayChange(idx, adaptedData));
        this.hourlyComponent.render(displayDays[this.currentDayIndex]?.hourly || []);
    }

    #initEvents() {
        this.#setupServiceTabs();
        this.#setupSearchForm();
        this.#setupTemperatureTypeToggler();
        this.#setupSearchByLocation();
        this.#setupAddToFavourite();
        this.#setupChartCheckboxes();
    }

    #setupTemperatureTypeToggler() {
        const toggleCheckbox = document.getElementById("unit-toggle-checkbox");
        const labelC = document.getElementById("unit-c");
        const labelF = document.getElementById("unit-f");

        if (toggleCheckbox) {
            toggleCheckbox.checked = (this.currentUnit === "F");
            const updateUI = () => {
                labelC?.classList.toggle("active", this.currentUnit === "C");
                labelF?.classList.toggle("active", this.currentUnit === "F");
            };
            updateUI();

            toggleCheckbox.addEventListener("change", (e) => {
                this.currentUnit = e.target.checked ? "F" : "C";
                localStorage.setItem("weatherUnit", this.currentUnit);
                updateUI();
                this.updateWeatherDisplay();
            });
        }
    }

    #setupChartCheckboxes() {
        const providers = [
            { id: 'chk-openmeteo', name: 'OpenMeteo' },
            { id: 'chk-openweathermap', name: 'OpenWeatherMap' },
            { id: 'chk-weather-api', name: 'WeatherAPI' }
        ];

        providers.forEach(p => {
            const checkbox = document.getElementById(p.id);
            if (checkbox) {
                checkbox.checked = this.activeChartProviders[p.name];
                checkbox.addEventListener('change', (e) => {
                    this.activeChartProviders[p.name] = e.target.checked;
                    this.#loadAndRender7DayCharts();
                });
            }
        });
    }

    #setupServiceTabs() {
        const tabs = document.querySelectorAll(".service-tab");
        tabs.forEach(tab => {
            tab.addEventListener("click", (e) => {
                tabs.forEach(t => t.classList.remove("active"));
                e.currentTarget.classList.add("active");
                this.currentProvider = e.currentTarget.textContent.trim();
                this.currentDayIndex = 0;
                this.updateWeatherDisplay(false);
            });
        });
    }

    #setupSearchForm() {
        const searchForm = document.querySelector(".search-form");
        const searchInput = document.querySelector(".search-input");
        if (searchForm && searchInput) {
            searchForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const query = searchInput.value.trim();
                if (!query) return;
                const geoResult = await this.#updateLocationByCityName(query);
                if (geoResult) {
                    this.updateWeatherDisplay();
                } else { alert("Location not found."); }
            });
        }
    }

    #setupSearchByLocation() {
        const geoBtn = document.getElementById("geo-location-btn");
        const searchInput = document.querySelector(".search-input");

        if (geoBtn) {
            geoBtn.addEventListener("click", () => {
                navigator.geolocation.getCurrentPosition(async (pos) => {
                    const lat = pos.coords.latitude;
                    const lon = pos.coords.longitude;

                    // Get the city name from coordinates
                    let locationName = "Current Location";
                    try {
                        const cityResult = await this.services.getCityNameByCoordinates(lat, lon);
                        if (cityResult) {
                            locationName = cityResult.split(',')[0];
                        }
                    } catch (err) {
                        console.error("Reverse geocoding failed:", err);
                    }

                    // Update controller state
                    this.currentLat = lat;
                    this.currentLon = lon;
                    this.city = locationName;
                    this.currentDayIndex = 0;

                    // Update UI input
                    if (searchInput) {
                        searchInput.value = this.city;
                    }

                    // Load data and refresh URL
                    await this.updateWeatherDisplay();

                    // #updateUrlAndUI() will update the browser URL and favourite button for location
                    this.#updateUrlAndUI();

                }, (err) => {
                    console.error("Geolocation error:", err);
                    alert("Could not get your location.");
                });
            });
        }
    }

    #setupAddToFavourite() {
        const favBtn = document.getElementById("favorite-toggle-btn");
        if (favBtn) {
            favBtn.addEventListener("click", () => {
                const city = this.city.trim();
                if (this.favorites.includes(city)) {
                    this.favorites = this.favorites.filter(i => i !== city);
                } else {
                    this.favorites.push(city);
                }
                localStorage.setItem("weatherFavorites", JSON.stringify(this.favorites));
                this.#updateUrlAndUI();
            });
        }
    }

    #updateUrlAndUI() {
        const url = new URL(window.location.href);
        url.searchParams.set('provider', this.currentProvider);
        url.searchParams.set('city', this.city);
        window.history.replaceState({}, '', url);

        const favBtn = document.getElementById("favorite-toggle-btn");
        if (favBtn) {
            const isFav = this.favorites.includes(this.city.trim());
            favBtn.classList.toggle("active", isFav);
            favBtn.textContent = isFav ? "Remove from favourite ★" : "Add to favourite ★";
        }
    }

    async #preloadAllProvidersCache() {
        await Promise.allSettled([
            this.services.getWeatherData('OpenMeteo', this.currentLat, this.currentLon),
            this.services.getWeatherData('OpenWeatherMap', this.currentLat, this.currentLon),
            this.services.getWeatherData('WeatherAPI', this.currentLat, this.currentLon)
        ]);
    }
}

new AppController().init();