async function fetchOpenMeteoFallback(settings) {
  // Try multiple possible shapes for saved location
  const loc =
    settings?.location ||
    settings?.loc ||
    settings?.site?.location ||
    null;

  const lat = loc?.lat ?? loc?.latitude;
  const lon = loc?.lon ?? loc?.lng ?? loc?.longitude;

  if (typeof lat !== "number" || typeof lon !== "number") {
    throw new Error(
      "No weather data method found AND no saved lat/lon. Go to Settings and set your location so Snow Day can fetch fallback data."
    );
  }

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m,visibility` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch` +
    `&timezone=auto&forecast_days=2`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Open-Meteo fallback failed: HTTP ${r.status}`);
  const j = await r.json();

  // Convert Open-Meteo hourly arrays into your algorithm-friendly objects
  const hourly = (j.hourly?.time || []).map((t, i) => {
    const snowfallCm = j.hourly?.snowfall?.[i] ?? 0; // Open-Meteo snowfall is in cm
    const snowfallIn = snowfallCm / 2.54;

    return {
      time: new Date(t),
      tempF: j.hourly?.temperature_2m?.[i] ?? null,
      precipIn: j.hourly?.precipitation?.[i] ?? 0,
      snowIn: snowfallIn,
      windMph: j.hourly?.wind_speed_10m?.[i] ?? 0,
      visibilityMi:
        j.hourly?.visibility?.[i] != null
          ? (j.hourly.visibility[i] / 1609.344)
          : null,
    };
  });

  return { hourly, failoverLevel: 99, provider: "open-meteo-fallback" };
}

async function getWeatherDataBestEffort(settings) {
  const API = window.API;

  if (API?.getSnowdayWeather) return API.getSnowdayWeather();
  if (API?.getHourlyForecast) return API.getHourlyForecast();
  if (API?.getForecastHourly) return API.getForecastHourly();
  if (API?.getWeatherData) return API.getWeatherData();
  if (API?.getWeather) return API.getWeather();

  if (window.Storage?.getLastWeatherData) return window.Storage.getLastWeatherData();
  if (window.Storage?.getCachedWeather) return window.Storage.getCachedWeather();

  // Fallback that always works if location exists
  return fetchOpenMeteoFallback(settings);
}
