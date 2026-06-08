import { API_KEYS } from "./config.js";
import { WeatherDataFormatter } from "./WeatherDataFormatter.js";

export class WeatherServices {
    #cache = {};
    #cache_TTL = 10 * 60 * 1000;

    constructor() {
        this.fallbackLat = 60.9827;
        this.fallbackLon = 25.6615;
        this.formatter = new WeatherDataFormatter();
    }

    getCachedData(provider, lat, lon) {
        const key = this.generateCacheKey(provider, lat, lon);
        return this.#cache[key] || null;
    }

    // Private helper to generate a unique cache key
    generateCacheKey(providerName, lat, lon) {
        // Round coordinates to 2 decimal places so small geocoder shifts map to the same cache entry
        const fixedLat = Number(lat).toFixed(2);
        const fixedLon = Number(lon).toFixed(2);
        return `${fixedLat}_${fixedLon}_${providerName}`;
    }

    // Public method used by controller to fetch weather data and cache it
    async getWeatherData(providerName, lat, lon) {
        const latitude = lat;
        const longitude = lon;

        const cacheKey = this.generateCacheKey(providerName, latitude, longitude);
        const now = Date.now();

        // Check whether cached data exists and is still valid
        if (this.#cache[cacheKey]) {
            const cachedItem = this.#cache[cacheKey];

            if (now - cachedItem.timestamp < this.#cache_TTL) {
                return cachedItem.data; // Return cached raw API response instantly
            } else {
                delete this.#cache[cacheKey];
            }
        }

        // If no cache exists or it is outdated
        const rawData = await this.fetchRawData(providerName, latitude, longitude);


        // Save fresh API response to cache with timestamp
        this.#cache[cacheKey] = {
            data: rawData,
            timestamp: now
        };

        const cacheKeys = Object.keys(this.#cache);
        if (cacheKeys.length > 30) {
            const oldestKey = cacheKeys[0]; // Remove the oldest cache entry when size grows
            delete this.#cache[oldestKey];
        }

        return rawData;
    }

    // Private helper for fetch requests
    async #fetchJson(url, errMessage) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(errMessage);
        return await response.json();
    }

    // Geocoding helper
    async getCoordinatesByCityName(cityName) {
        if (!cityName) return null;
        const encodedCity = encodeURIComponent(cityName);
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodedCity}&count=1&language=en`;

        try {
            const data = await this.#fetchJson(url, "Geocoding request failed");
            if (data.results && data.results.length > 0) {
                const result = data.results[0];
                return {
                    lat: result.latitude,
                    lon: result.longitude,
                    fullName: `${result.name}, ${result.admin1 || ''}, ${result.country}`
                };
            }
            return null;
        } catch (error) {
            console.error("Geocoding error:", error);
            return null;
        }
    }

    async getCityNameByCoordinates(lat, lon) {
        if (!lat || !lon) return null;

        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1&accept-language=en`;

        try {
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "WeatherDashboardApp/1.0"
                }
            });

            if (!response.ok) {
                throw new Error(`Nominatim HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result && result.address) {
                const addr = result.address;

                // The city name may appear in different address fields depending on the region
                const cityName = addr.city || addr.town || addr.village || addr.suburb || addr.municipality;
                const countryName = addr.country || "";

                if (cityName) {
                    return countryName ? `${cityName}, ${countryName}` : cityName;
                }
            }

            return null;
        } catch (error) {
            console.error("Reverse geocoding failed:", error);
            return null;
        }
    }

    // Raw data fetch dispatcher for each provider
    async fetchRawData(providerName, lat, lon) {

        if (providerName === "OpenMeteo") {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,relative_humidity_2m_max&timezone=auto`;
            return await this.#fetchJson(url, 'OpenMeteo API error');
        }

        if (providerName === "OpenWeatherMap") {
            const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEYS.openWeather}&units=metric`;
            return await this.#fetchJson(url, 'OpenWeatherMap API error');
        }

        if (providerName === "WeatherAPI") {
            const url = `https://api.weatherapi.com/v1/forecast.json?key=${API_KEYS.weatherApi}&q=${lat},${lon}&days=7&aqi=no&alerts=no`;
            return await this.#fetchJson(url, 'WeatherApi API error');
        }

        throw new Error(`Unknown provider: ${providerName}`);
    }

    // Helper to map WMO codes
    // Data normalization has been moved into the service class
    /**
     * Main public dispatcher method for adapting raw provider data
     * @param {string} providerName - Name of the current provider
     * @param {Object} rawData - Raw API response data
     * @returns {Object} Normalized forecast object
     */
    normalizeData(providerName, rawData) {
        const normalized = { subTitle: providerName, days: [] };

        try {
            if (providerName === "OpenMeteo") {
                return this.#normalizeOpenMeteo(rawData);
            }
            if (providerName === "WeatherAPI") {
                return this.#normalizeWeatherAPI(rawData);
            }
            if (providerName === "OpenWeatherMap") {
                return this.#normalizeOpenWeatherMap(rawData);
            }

            throw new Error(`Unknown provider for normalization: ${providerName}`);
        } catch (e) {
            console.error(`Normalization failed for ${providerName}. Check API status or response structure.`, e);
            // Fallback so the UI does not crash completely
            normalized.days = Array(3).fill({ tempRange: "Error", condition: "Bad Key/API", icon: "⚠️" });
            return normalized;
        }
    }

    /**
     * Adapter for OpenMeteo 
     */
    #normalizeOpenMeteo(rawData) {
        try {
            if (!rawData || !rawData.daily) {
                throw new Error("Invalid or empty Open-Meteo data structure");
            }

            const daily = rawData.daily;
            const days = [];

            for (let i = 0; i < 3; i++) {
                // Safely retrieve daily temperature extremes
                const max = Math.round(daily.temperature_2m_max?.[i] ?? daily.temperature_max?.[i] ?? 0);
                const min = Math.round(daily.temperature_2m_min?.[i] ?? daily.temperature_min?.[i] ?? 0);

                // Open-Meteo may use either weather_code or weathercode keys; handle both
                const code = daily.weather_code?.[i] ?? daily.weathercode?.[i] ?? 0;

                // Extract wind speed (convert km/h to m/s) and humidity for the day card
                const rawWind = daily.wind_speed_10m_max?.[i] ?? daily.windspeed_10m_max?.[i] ?? 0;
                const windSpeed = parseFloat((rawWind / 3.6).toFixed(1));
                const humidity = Math.round(daily.relative_humidity_2m_max?.[i] ?? daily.relative_humidity_2m_mean?.[i] ?? 0);

                // Extract 24-hour blocks for the day from the flat Open-Meteo arrays
                const startIndex = i * 24;
                const endIndex = startIndex + 24;
                const hourlyIntervals = [];

                if (rawData.hourly && rawData.hourly.time) {
                    for (let h = startIndex; h < endIndex; h += 3) {
                        if (!rawData.hourly.time[h]) break;

                        // Convert timestamp format like "2026-06-05T03:00" to just "03:00"
                        const fullTimeStr = rawData.hourly.time[h];
                        const time = fullTimeStr.includes("T") ? fullTimeStr.split("T")[1] : fullTimeStr;

                        // Safely read hourly temperature
                        const temp = Math.round(rawData.hourly.temperature_2m?.[h] ?? 0);

                        // Hourly weather code, fallback to daily code if needed
                        const hourlyCode = rawData.hourly.weather_code?.[h] ?? rawData.hourly.weathercode?.[h] ?? code;

                        // Define if it is day time or night time
                        const isDay = (h % 24) >= 6 && (h % 24) < 20;

                        hourlyIntervals.push({
                            time: time,
                            temp: this.formatter.formatTemperature(temp),
                            icon: this.formatter.mapWmoCodeToEmoji(hourlyCode, isDay)
                        });
                    }
                }


                days.push({
                    date: daily.time?.[i] || new Date().toISOString().split('T')[0],
                    tempRange: `${this.formatter.formatTemperature(min)} .. ${this.formatter.formatTemperature(max)}`,
                    condition: "Synchronized Feed",
                    icon: this.formatter.mapWmoCodeToEmoji(code),
                    windSpeed: isNaN(windSpeed) ? 0 : windSpeed, // App.js expects wind data
                    humidity: humidity,                          // App.js expects humidity data
                    hourly: hourlyIntervals
                });
            }

            const currentHour = new Date().getHours();
            const currentTemp = Math.round(rawData.hourly.temperature_2m?.[currentHour] ?? 0);
            const currentCode = rawData.hourly.weather_code?.[currentHour] ?? 0;
            const currentWind = Math.round((rawData.hourly.wind_speed_10m?.[currentHour] ?? 0) / 3.6);
            const currentHumidity = Math.round(rawData.hourly.relative_humidity_2m?.[currentHour] ?? 0);

            const isDay = currentHour >= 6 && currentHour < 20;
            const currentIcon = this.formatter.mapWmoCodeToEmoji(currentCode, isDay);

            const currentWeatherInfo = this.formatter.getWeatherType(currentCode);

            const current = {
                temp: this.formatter.formatTemperature(currentTemp),
                desc: currentWeatherInfo.text,
                type: currentWeatherInfo.type,
                icon: currentIcon,
                wind: currentWind,
                humidity: currentHumidity
            };

            return {
                service: "OpenMeteo",
                current: current,
                days: days
            };

        } catch (err) {
            console.error("Critical error in #normalizeOpenMeteo:", err);
            return {
                service: "OpenMeteo",
                days: []
            };
        }
    }

    /**
     * WeatherAPI.com data adapter
     */
    #normalizeWeatherAPI(rawData) {
        const days = rawData.forecast.forecastday.map(dayItem => {
            const max = Math.round(dayItem.day.maxtemp_c);
            const min = Math.round(dayItem.day.mintemp_c);

            // Extract hours from WeatherAPI at 3-hour intervals
            const hourlyIntervals = dayItem.hour
                .filter((_, index) => index % 3 === 0) // Filter every 3rd hour (0, 3, 6...)
                .map(hourItem => {
                    // API time string looks like "2026-06-05 03:00" -> take "03:00"
                    const time = hourItem.time.split(" ")[1];
                    return {
                        time: time,
                        temp: `+${Math.round(hourItem.temp_c)}°`,
                        icon: hourItem.condition.icon // Direct WeatherAPI icon URL
                    };
                });

            return {
                tempRange: `+${min}° .. +${max}°`,
                condition: dayItem.day.condition.text,
                icon: dayItem.day.condition.icon,
                hourly: hourlyIntervals // Ensure the hourly field is always present
            };
        });


        const currentWeatherInfo = this.formatter.getWeatherType(rawData.current.condition.text ?? 0);

        const current = {
            temp: this.formatter.formatTemperature(Math.round(rawData.current.temp_c)),
            desc: currentWeatherInfo.text,
            type: currentWeatherInfo.type,
            icon: rawData.current.condition.icon,
            wind: Math.round(rawData.current.wind_kph / 3.6),
            humidity: rawData.current.humidity
        }

        return {
            service: "WeatherAPI.com",
            current: current,
            days: days
        };
    }

    /**
     * OpenWeatherMap data adapter (3-hour interval grouping)
     */
    #normalizeOpenWeatherMap(rawData) {
        const groupedDays = {};
        // Get timezone offset in milliseconds (API returns seconds)
        const timezoneOffsetMs = rawData.city.timezone * 1000;

        // Group available intervals by the city local dates
        rawData.list.forEach(item => {
            // Convert the UTC item time to the city's local time
            const utcTimestamp = item.dt * 1000;
            const localDate = new Date(utcTimestamp + timezoneOffsetMs);

            // Get the date key in YYYY-MM-DD format
            const dateKey = localDate.toISOString().split("T")[0];

            // Extract the local hour for grouping
            const localHour = localDate.getUTCHours();

            if (!groupedDays[dateKey]) {
                groupedDays[dateKey] = { temps: [], intervals: [] };
            }

            // Store the temperature for min/max range calculation
            groupedDays[dateKey].temps.push(item.main.temp);

            // Prepare the hourly panel structure
            groupedDays[dateKey].intervals.push({
                hour: localHour,
                time: `${String(localHour).padStart(2, '0')}:00`,
                temp: `+${Math.round(item.main.temp)}°`,
                icon: `https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png`,
                condition: item.weather[0].main
            });
        });

        // Generate strict calendar dates (Today, Tomorrow, Day after) according to city timezone
        const targetDates = [];
        const nowUtc = Date.now();

        for (let i = 0; i < 3; i++) {
            const targetLocalDate = new Date(nowUtc + timezoneOffsetMs + (i * 24 * 60 * 60 * 1000));
            targetDates.push(targetLocalDate.toISOString().split("T")[0]);
        }

        const days = [];

        // Collect data strictly for the targetDates calendar grid
        targetDates.forEach((dateKey, index) => {
            // If at least one hour of data exists for that date
            if (groupedDays[dateKey]) {
                const dayData = groupedDays[dateKey];
                const minTemp = Math.round(Math.min(...dayData.temps));
                const maxTemp = Math.round(Math.max(...dayData.temps));

                // Find the local interval closest to midday (12:00 or 15:00) for the main icon
                const middayItem = dayData.intervals.find(int => int.hour === 12)
                    || dayData.intervals.find(int => int.hour === 15)
                    || dayData.intervals[0];

                // Filter hours every 3 hours within the current calendar day
                const finalHourly = dayData.intervals
                    .filter(int => int.hour % 3 === 0)
                    .map(int => ({
                        time: int.time,
                        temp: int.temp,
                        icon: int.icon
                    }));

                // Build the day card weather text from the midday interval
                const rawItemForMidday = rawData.list.find(item => {
                    const localItemDate = new Date((item.dt * 1000) + timezoneOffsetMs);
                    return localItemDate.getUTCHours() === middayItem.hour && localItemDate.toISOString().startsWith(dateKey);
                }) || rawData.list[0];

                // Use a single temperature if min and max are equal
                const tempRangeStr = minTemp === maxTemp ? `+${maxTemp}°` : `+${minTemp}° .. +${maxTemp}°`;

                days.push({
                    tempRange: tempRangeStr,
                    condition: rawItemForMidday.weather[0].main,
                    icon: middayItem.icon,
                    hourly: finalHourly // Only this day's hours are included here
                });

            } else {
                // Fallback: if today's data has already rolled off the server, provide an end-of-day placeholder
                days.push({
                    tempRange: "N/A",
                    condition: index === 0 ? "End of Day" : "No Data",
                    icon: "https://openweathermap.org/img/wn/01n@2x.png",
                    hourly: [] // This day's hourly panel will be empty
                });
            }
        });

        const currentItem = rawData.list[0];
        const currentWeatherInfo = this.formatter.getWeatherType(currentItem.weather[0].main ?? 0);
        const current = {
            temp: this.formatter.formatTemperature(Math.round(currentItem.main.temp)),
            desc: currentWeatherInfo.text,
            type: currentWeatherInfo.type,
            icon: `https://openweathermap.org/img/wn/${currentItem.weather[0].icon}@2x.png`,
            wind: Math.round(currentItem.wind.speed), // OpenWeatherMap already returns wind in m/s
            humidity: currentItem.main.humidity
        }

        return {
            service: "OpenWeatherMap",
            current: current,
            days: days
        };
    }


    get7DayChartsData(activeProviders, lat, lon) {
        const chartsData = {};

        Object.entries(activeProviders).forEach(([providerName, isActive]) => {
            if (isActive) {
                // Generate the same cache key from coordinates as used in getWeatherData
                const cacheKey = this.generateCacheKey(providerName, lat, lon);
                const cachedItem = this.#cache[cacheKey];

                // If cached data exists (cachedItem.data), send it to the metrics parser
                if (cachedItem && cachedItem.data) {
                    chartsData[providerName] = this.#extract7DayMetrics(providerName, cachedItem.data);
                } else {
                    chartsData[providerName] = null;
                }
            } else {
                chartsData[providerName] = null;
            }
        });

        return chartsData;
    }

    #extract7DayMetrics(providerName, rawData) {
        const metrics = {
            temperature: [],
            windSpeed: [],
            humidity: []
        };

        try {
            if (!rawData) return metrics;

            // OpenMeteo
            if (providerName === "OpenMeteo" && rawData.daily) {
                const daily = rawData.daily;

                for (let i = 0; i < 7; i++) {
                    // Safely extract temperature
                    const min = daily.temperature_2m_min?.[i] ?? daily.temperature_min?.[i] ?? 0;
                    const max = daily.temperature_2m_max?.[i] ?? daily.temperature_max?.[i] ?? 0;
                    metrics.temperature.push(Math.round((min + max) / 2));

                    // Safely extract wind using alternative keys if needed
                    const rawWind = daily.wind_speed_10m_max?.[i] ?? daily.windspeed_10m_max?.[i] ?? daily.wind_speed?.[i] ?? 0;
                    const windSpeed = parseFloat((rawWind / 3.6).toFixed(1)); // km/h -> m/s
                    metrics.windSpeed.push(isNaN(windSpeed) ? 0 : windSpeed);

                    // Safely extract humidity
                    const rawHumidity = daily.relative_humidity_2m_max?.[i] ?? daily.relative_humidity_2m_mean?.[i] ?? daily.humidity?.[i] ?? 0;
                    metrics.humidity.push(Math.round(rawHumidity));
                }
            }

            // 2. OpenWeatherMap
            else if (providerName === "OpenWeatherMap" && rawData.list) {
                for (let i = 0; i < rawData.list.length; i += 8) {
                    if (metrics.temperature.length >= 7) break;
                    const item = rawData.list[i];
                    if (item) {
                        metrics.temperature.push(Math.round(item.main?.temp ?? 0));
                        metrics.windSpeed.push(parseFloat((item.wind?.speed ?? 0).toFixed(1)));
                        metrics.humidity.push(item.main?.humidity ?? 0);
                    }
                }
            }

            // 3. WeatherAPI (WeatherAPI)
            else if (providerName === "WeatherAPI" && rawData.forecast?.forecastday) {
                rawData.forecast.forecastday.slice(0, 7).forEach(dayItem => {
                    if (dayItem?.day) {
                        metrics.temperature.push(Math.round(dayItem.day.avgtemp_c ?? 0));
                        metrics.windSpeed.push(parseFloat(((dayItem.day.maxwind_kph ?? 0) / 3.6).toFixed(1)));
                        metrics.humidity.push(dayItem.day.avghumidity ?? 0);
                    }
                });
            }

            // Safety layer: expand arrays to 7 elements so charts do not break
            while (metrics.temperature.length < 7) {
                metrics.temperature.push(metrics.temperature[metrics.temperature.length - 1] || 0);
                metrics.windSpeed.push(metrics.windSpeed[metrics.windSpeed.length - 1] || 0);
                metrics.humidity.push(metrics.humidity[metrics.humidity.length - 1] || 0);
            }

            return metrics;

        } catch (e) {
            console.error(`Error parsing 7-day metrics for ${providerName}:`, e);
            return metrics; // Return empty arrays instead of null so the UI does not break
        }
    }
}