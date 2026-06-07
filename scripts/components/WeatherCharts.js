export class WeatherCharts {
    constructor() {
        this.tempChart = null;
        this.windChart = null;
        this.humidityChart = null;

        // Generate labels for the next 7 days starting today
        this.labels = this.#generate7DayLabels();
    }

    // Helper method to generate X-axis labels automatically
    #generate7DayLabels() {
        const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const labels = [];
        const today = new Date();

        for (let i = 0; i < 7; i++) {
            const nextDay = new Date(today);
            nextDay.setDate(today.getDate() + i);

            // Use "Today" for the first label, otherwise show weekday name
            if (i === 0) {
                labels.push("Today");
            } else {
                labels.push(daysOfWeek[nextDay.getDay()]);
            }
        }
        return labels;
    }

    /**
     * Render or update the 7-day charts
     * @param {Object} activeProviders - Which services to display (e.g. { OpenMeteo: true, WeatherAPI: false })
     * @param {Object} providersData - Data from each provider
     */
    render(unit, activeProviders, providersData) {
        const tempDatasets = [], windDatasets = [], humidityDatasets = [];

        for (const [providerName, data] of Object.entries(providersData)) {
            if (!data || (activeProviders && activeProviders[providerName] === false)) continue;

            // Convert temperature values if needed
            const temperatureValues = unit === 'F'
                ? data.temperature.map(c => Math.round((c * 9 / 5) + 32))
                : data.temperature;

            tempDatasets.push({ name: providerName, values: temperatureValues });
            windDatasets.push({ name: providerName, values: data.windSpeed });
            humidityDatasets.push({ name: providerName, values: data.humidity });
        }

        // Include current temperature unit in the chart title
        const tempTitle = `Air Temperature (${unit === 'C' ? '°C' : '°F'})`;

        this.#createOrUpdateChart('#temp-chart-container', tempTitle, tempDatasets);
        this.#createOrUpdateChart('#wind-chart-container', 'Wind Speed (m/s)', windDatasets);
        this.#createOrUpdateChart('#humidity-chart-container', 'Relative Humidity (%)', humidityDatasets);
    }

    #createOrUpdateChart(selector, title, datasets, chartInstance) {
        const element = document.querySelector(selector);
        if (!element) return null;

        // If no providers are selected, clear the container so the chart doesn't break
        if (datasets.length === 0) {
            element.innerHTML = '<span class="chart-blank-state">Select at least one weather provider to see graph</span>';
            return null;
        }

        const chartData = {
            labels: this.labels,
            datasets: datasets
        };

        const chartColors = datasets.map(d => {
            const colorsMap = { 'OpenMeteo': '#a333c8', 'OpenWeatherMap': '#e03997', 'WeatherAPI': '#21ba45' };
            return colorsMap[d.name] || '#2196F3';
        });

        // Fix axis positions by recreating the chart after checkbox changes
        // This prevents Frappe Charts from reusing stale axis data.
        element.innerHTML = '';

        return new frappe.Chart(selector, {
            title: title,
            data: chartData,
            type: 'line',
            height: 220,
            colors: chartColors,
            lineOptions: {
                regionFill: 0,
                spline: 1
            },
            axisOptions: {
                xIsSeries: 1
            }
        });
    }
}