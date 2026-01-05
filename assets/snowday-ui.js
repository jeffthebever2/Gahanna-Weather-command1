/**
 * snowday-ui.js
 * Snow Day / School Impact page: renders UI + fetches weather with fallbacks.
 *
 * Fallback ladder:
 * 1) window.API.getSnowdayWeather()
 * 2) window.API.getHourlyForecast() / getForecastHourly() / getWeatherData() / getWeather()
 * 3) window.Storage cached getters (getLastWeatherData / getCachedWeather)
 * 4) Open-Meteo hourly (has snowfall)
 * 5) NWS hourly (backup)
 *
 * Default location: Gahanna, OH (used if no saved lat/lon exists)
 */

// ---- Default location (Gahanna, OH) ----
const DEFAULT_LOCATION = {
  name: "Gahanna, OH",
  lat: 40.0192,
  lon: -82.8793,
};

function resolveLocation(settings) {
  // Try multiple shapes your settings might use
  const loc =
    settings?.location ||
    settings?.loc ||
    settings?.site?.location ||
    settings?.profile?.location ||
    null;

  const lat = loc?.lat ?? loc?.latitude;
  const lon = loc?.lon ?? loc?.lng ?? loc?.longitude;

  if (typeof lat === "number" && typeof lon === "number") {
    return { name: loc?.name || "Saved Location", lat, lon };
  }

  // Fallback to Gahanna
  return DEFAULT_LOCATION;
}

function safeNum(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function barRow(name, score, weight, explanation) {
  const pct = Math.round(safeNum(score, 0));
  const contrib = Math.round(safeNum(score, 0) * safeNum(weight, 0));
  return `
    <div class="factor-row">
      <div class="factor-head">
        <div class="factor-name">${name}</div>
        <div class="factor-meta">Score ${pct} • Weight ${Math.round(safeNum(weight, 0) * 100)}% • Contrib ${contrib}</div>
      </div>
      <div class="factor-bar">
        <div class="factor-bar-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div>
      </div>
      <div class="factor-expl">${explanation}</div>
    </div>
  `;
}

export function renderSnowday(container, prediction, weatherData, settings) {
  const s = settings || {};
  const loc = resolveLocation(s);
  const bus = s.schoolTimes?.busTime || "07:00";
  const bell = s.schoolTimes?.firstBell || "08:00";

  const provider =
    weatherData?.provider ||
    weatherData?.source ||
    (weatherData?.failoverLevel != null ? `failover-${weatherData.failoverLevel}` : "unknown");

  container.innerHTML = `
    <h1>Snow Day / School Impact</h1>
    <p class="card-label">${loc.name} • Bus ${bus} • First bell ${bell} • Source: ${provider}</p>

    <div class="cards-grid">
      <div class="card">
        <div class="card-header">Probability</div>
        <div class="card-value">${safeNum(prediction?.probability, 0)}%</div>
        <div class="card-label">${prediction?.recommendation ?? "—"}</div>
      </div>
      <div class="card">
        <div class="card-header">Confidence</div>
        <div class="card-value">${safeNum(prediction?.confidence, 0)}%</div>
        <div class="card-label">Failover level: ${weatherData?.failoverLevel ?? 0}</div>
      </div>
      <div class="card">
        <div class="card-header">Human Adjustment</div>
        <div class="card-value">${safeNum(prediction?.humanAdjustment, 0) >= 0 ? "+" : ""}${safeNum(prediction?.humanAdjustment, 0)}</div>
        <div class="card-label">Bounded to ±10</div>
      </div>
    </div>

    <h2>Why</h2>
    <div class="card">
      ${(prediction?.factors || [])
        .map((f) => barRow(f.name, f.score, f.weight, f.explanation))
        .join("")}
    </div>

    <h2>Why Not</h2>
    <div class="card">
      <p>If the probability is low, it usually means one or more of these are true:</p>
      <ul>
        <li>Snow is light or falls mostly outside the commute window.</li>
        <li>Temps are warm enough for melting/treated roads.</li>
        <li>Precipitation is uncertain or not wintry.</li>
      </ul>
    </div>
  `;
}

function normalizeWeatherData(weatherData) {
  if (!weatherData || !Array.isArray(weatherData.hourly)) return weatherData;

  // Algorithm compares h.time as Date objects; convert ISO strings/numbers to Date.
  weatherData.hourly = weatherData.hourly.map((h) => {
    const t = h?.time;
    const time =
      t instanceof Date
        ? t
        : (typeof t === "string" || typeof t === "number")
          ? new Date(t)
          : null;

    return { ...h, time: time ?? new Date() };
  });

  return weatherData;
}

// ---------- External fallbacks ----------

async function fetchOpenMeteoHourly({ lat, lon }) {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m,visibility` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch` +
    `&timezone=auto&forecast_days=2`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Open-Meteo failed: HTTP ${r.status}`);
  const j = await r.json();

  const hourlyTimes = j.hourly?.time || [];
  const hourly = hourlyTimes.map((t, i) => {
    const snowfallCm = safeNum(j.hourly?.snowfall?.[i], 0); // cm
    const snowfallIn = snowfallCm / 2.54;

    const visM = j.hourly?.visibility?.[i];
    const visibilityMi =
      visM != null && Number.isFinite(Number(visM)) ? Number(visM) / 1609.344 : null;

    return {
      time: new Date(t),
      tempF: j.hourly?.temperature_2m?.[i] ?? null,
      precipIn: safeNum(j.hourly?.precipitation?.[i], 0),
      snowIn: safeNum(snowfallIn, 0),
      windMph: safeNum(j.hourly?.wind_speed_10m?.[i], 0),
      visibilityMi,
    };
  });

  return { hourly, failoverLevel: 80, provider: "open-meteo" };
}

async function fetchNwsHourly({ lat, lon }) {
  // NWS: points -> forecastHourly
  const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
  const pRes = await fetch(pointsUrl, {
    cache: "no-store",
    headers: { Accept: "application/geo+json" },
  });
  if (!pRes.ok) throw new Error(`NWS points failed: HTTP ${pRes.status}`);
  const pJson = await pRes.json();

  const hourlyUrl = pJson?.properties?.forecastHourly;
  if (!hourlyUrl) throw new Error("NWS forecastHourly missing");

  const hRes = await fetch(hourlyUrl, {
    cache: "no-store",
    headers: { Accept: "application/geo+json" },
  });
  if (!hRes.ok) throw new Error(`NWS hourly failed: HTTP ${hRes.status}`);
  const hJson = await hRes.json();

  const periods = hJson?.properties?.periods || [];

  // NWS doesn’t always provide explicit snowfall totals. Map what we can.
  const hourly = periods.map((p) => {
    // windSpeed like "10 mph" or "5 to 10 mph"
    const wind =
      typeof p.windSpeed === "string" ? parseFloat(p.windSpeed) || 0 : 0;

    return {
      time: new Date(p.startTime),
      tempF: p.temperature ?? null,
      precipIn: 0,
      snowIn: 0,
      windMph: wind,
      visibilityMi: null,
    };
  });

  return { hourly, failoverLevel: 90, provider: "nws" };
}

// ---------- Internal providers + cache + fallbacks ----------

async function getWeatherDataBestEffort(settings) {
  const API = window.API;

  // 1) Your internal providers (best)
  if (API?.getSnowdayWeather) return API.getSnowdayWeather();
  if (API?.getHourlyForecast) return API.getHourlyForecast();
  if (API?.getForecastHourly) return API.getForecastHourly();
  if (API?.getWeatherData) return API.getWeatherData();
  if (API?.getWeather) return API.getWeather();

  // 2) Cached storage (if your app stores it)
  if (window.Storage?.getLastWeatherData) return window.Storage.getLastWeatherData();
  if (window.Storage?.getCachedWeather) return window.Storage.getCachedWeather();

  // 3) External fallbacks (no keys)
  const loc = resolveLocation(settings);

  // Open-Meteo first (has snowfall)
  try {
    return await fetchOpenMeteoHourly(loc);
  } catch (e) {
    console.warn("Open-Meteo fallback failed:", e);
  }

  // Then NWS hourly
  return await fetchNwsHourly(loc);
}

export async function initSnowDayPage() {
  const container = document.getElementById("snowday-container");
  if (!container) {
    console.error("Snow Day page: missing #snowday-container");
    return;
  }

  try {
    const settings = window.Storage?.getSettings?.() || {};
    const loc = resolveLocation(settings);

    if (!window.SnowDayAlgorithm?.calculate) {
      throw new Error("SnowDayAlgorithm not loaded (window.SnowDayAlgorithm.calculate missing).");
    }

    let weatherData = await getWeatherDataBestEffort(settings);
    weatherData = normalizeWeatherData(weatherData);

    // Helpful: if your algorithm expects other field names, you can adapt here later.
    const prediction = window.SnowDayAlgorithm.calculate(weatherData, settings);

    // If you want to show the resolved location name even when settings are empty:
    // store it in settings clone for render label
    const renderSettings = {
      ...settings,
      location: settings.location ?? loc,
    };

    renderSnowday(container, prediction, weatherData, renderSettings);
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <h1>Snow Day / School Impact</h1>
      <div class="card">
        <div class="card-header">Error</div>
        <p class="card-label">Snow Day page failed to load.</p>
        <pre style="white-space:pre-wrap;overflow:auto;margin:0;">${String(err?.message || err)}</pre>
        <p class="card-label">Open DevTools → Console for details.</p>
      </div>
    `;
  }
}

// Make available to your non-module inline init call in snowday.html
if (typeof window !== "undefined") {
  window.renderSnowday = renderSnowday;
  window.initSnowDayPage = initSnowDayPage;
}
