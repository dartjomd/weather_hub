export class WeatherDataFormatter {
    mapWmoCodeToEmoji(code) {
        if (code === 0) return "☀️";
        if (code <= 3) return "⛅";
        if (code <= 48) return "☁️";
        if (code <= 67) return "🌦️";
        return "🌧️";
    }

    mapWmoCodeToText(code) {
        const descriptions = {
            0: "Clear sky",
            1: "Mainly clear",
            2: "Partly cloudy",
            3: "Overcast",
            45: "Foggy",
            48: "Depositing rime fog",
            61: "Rain",
            71: "Snow",
            95: "Thunderstorm"
        };
        return descriptions[code] || "Weather";
    }

    getWeatherType(code) {
        const weatherMap = {
            0: { text: "Clear sky", type: "clear" },
            1: { text: "Mainly clear", type: "clear" },
            2: { text: "Partly cloudy", type: "clouds" },
            3: { text: "Overcast", type: "clouds" },
            45: { text: "Foggy", type: "clouds" },
            61: { text: "Rain", type: "rain" },
            71: { text: "Snow", type: "snow" },
            95: { text: "Thunderstorm", type: "storm" }
        };
        return weatherMap[code] || { text: "Cloudy", type: "clouds" };
    }

    formatTemperature(value) {
        return `${value > 0 ? '+' : ''}${value}°`;
    }
}
