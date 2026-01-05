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
  return DEFAULT_LOCATION;
}

function safeNum(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function barRow(name, score, weight, explanation) {
  const pct = clamp(Math.round(safeNum(score, 0)), 0, 100);
  const w = clamp(safeNum(weight, 0), 0, 1);
  const contrib = Math.round(pct * w);

  const strength =
    pct >= 75 ? "Strong signal" : pct >= 50 ? "Moderate signal" : pct >= 25 ? "Weak signal" : "Very weak signal";

  return `
    <div class="factor-row">
      <div class="factor-head">
        <div class="factor-name">${name}</div>
        <div class="factor-meta">${strength} • ${pct}% • Weight ${Math.round(w * 100)}%</div>
      </div>
      <div class="factor-bar">
        <div class="factor-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="factor-expl">${explanation}</div>
    </div>
  `;
}

function describeLowProbability(prediction, weatherData) {
  const p = safeNum(prediction?.probability, 0);

  // Try to infer the "top reasons holding it down" from factors
  const factors = Array.isArray(prediction?.factors) ? prediction.factors : [];
  const lowOnes = [...factors]
    .sort((a, b) => safeNum(a.score, 0) - safeNum(b.score, 0))
    .slice(0, 3);

  const provider = weatherData?.provider || "your weather source";
  const hasSnowMetric =
    Array.isArray(weatherData?.hourly) && weatherData.hourly.some((h) => safeNum(h?.snowIn, 0) > 0);

  // A nicer, more specific block depending on probability range
  if (p < 15) {
    return `
      <div class="why-low-box">
        <div class="why-low-title">Why it’s very low (${p}%)</div>
        <ul class="why-low-list">
          <li><b>Not enough “closure-level” impact signals</b> during the commute window based on ${provider}.</li>
          <li><b>Road conditions likely manageable</b> (either not much snow/ice expected, or temps/wind don’t support rapid icing).</li>
          <li><b>Uncertainty is usually in your favor</b> at this level: models can be wrong, but it typically takes a big miss to reach closing territory.</li>
          ${!hasSnowMetric ? `<li><b>Note:</b> This source may not provide explicit snowfall totals. Snow score may rely more on precip/temp patterns.</li>` : ""}
        </ul>
        ${lowOnes.length ? `
          <div class="why-low-sub">
            <div class="why-low-subtitle">Weakest signals right now</div>
            <ul class="why-low-list compact">
              ${lowOnes.map(f => `<li><b>${f.name}:</b> ${clamp(Math.round(safeNum(f.score,0)),0,100)}% — ${f.explanation}</li>`).join("")}
            </ul>
          </div>
        ` : ""}
      </div>
    `;
  }

  if (p < 35) {
    return `
      <div class="why-low-box">
        <div class="why-low-title">Why it’s low-ish (${p}%)</div>
        <ul class="why-low-list">
          <li><b>Some impact is possible</b>, but the strongest closure triggers aren’t lining up together (snow + timing + temperature + wind/visibility).</li>
          <li><b>Timing matters:</b> if heavier precip is outside the commute window, roads often get treated/cleared before it counts.</li>
          <li><b>Small changes can swing it</b>: a 2–4°F drop, heavier banding, or earlier onset can bump probability quickly.</li>
        </ul>
        ${lowOnes.length ? `
          <div class="why-low-sub">
            <div class="why-low-subtitle">What’s holding it back most</div>
            <ul class="why-low-list compact">
              ${lowOnes.map(f => `<li><b>${f.name}:</b> ${clamp(Math.round(safeNum(f.score,0)),0,100)}% — ${f.explanation}</li>`).join("")}
            </ul>
          </div>
        ` : ""}
      </div>
    `;
  }

  return `
    <div class="why-low-box">
      <div class="why-low-title">Why it isn’t higher (${p}%)</div>
      <ul class="why-low-list">
        <li><b>Conditions may be borderline</b> — enough to affect travel, not enough (yet) to make closing the most likely choice.</li>
        <li><b>Watch the next forecast update</b>: shifts in start time, intensity, and temperatures usually decide the direction.</li>
      </ul>
      ${lowOnes.length ? `
        <div class="why-low-sub">
          <div class="why-low-subtitle">Biggest “missing pieces”</div>
          <ul class="why-low-list compact">
            ${lowOnes.map(f => `<li><b>${f.name}:</b> ${clamp(Math.round(safeNum(f.score,0)),0,100)}% — ${f.explanation}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
    </div>
  `;
}

export function renderSnowday(container, prediction, weatherData, settings) {
  const s = settings || {};
  const loc = resolveLocation(s);

  const provider =
    weatherData?.provider ||
    weatherData?.source ||
    (weatherData?.failoverLevel != null ? `failover-${weatherData.failoverLevel}` : "unknown");

  const prob = safeNum(prediction?.probability, 0);
  const conf = safeNum(prediction?.confidence, 0);

  // Create a short, nicer "why" summary
  const factors = Array.isArray(prediction?.factors) ? prediction.factors : [];
  const topDrivers = [...factors]
    .sort((a, b) => safeNum(b.score, 0) * safeNum(b.weight, 0) - safeNum(a.score, 0) * safeNum(a.weight, 0))
    .slice(0, 3);

  container.innerHTML = `
    <h1>Snow Day / School Impact</h1>
    <p class="card-label">${loc.name} • Source: ${provider}</p>

    <div class="cards-grid">
      <div class="card">
        <div class="card-header">Probability</div>
        <div class="card-value">${prob}%</div>
        <div class="card-label">${prediction?.recommendation ?? "—"}</div>
      </div>
      <div class="card">
        <div class="card-header">Confidence</div>
        <div class="card-value">${conf}%</div>
        <div class="card-label">Failover level: ${weatherData?.failoverLevel ?? 0}</div>
      </div>
      <div class="card">
        <div class="card-header">Human Adjustment</div>
        <div class="card-value">${safeNum(prediction?.humanAdjustment, 0) >= 0 ? "+" : ""}${safeNum(prediction?.humanAdjustment, 0)}</div>
        <div class="card-label">Bounded to ±10</div>
      </div>
    </div>

    <h2>Why</h2>
    <div class="card why-card">
      <div class="why-summary">
        <div class="why-summary-title">Top drivers</div>
        <div class="why-chips">
          ${
            topDrivers.length
              ? topDrivers
                  .map(
                    (f) =>
                      `<span class="why-chip"><b>${f.name}</b> • ${clamp(Math.round(safeNum(f.score,0)),0,100)}%</span>`
                  )
                  .join("")
              : `<span class="card-label">No factor breakdown available.</span>`
          }
        </div>
      </div>

      <div class="why-details">
        ${(factors || []).map((f) => barRow(f.name, f.score, f.weight, f.explanation)).join("")}
      </div>
    </div>

    <h2>Why it might be low</h2>
    <div class="card">
      ${describeLowProbability(prediction, weatherData)}
    </div>
  `;
}

function normalizeWeatherData(weatherData) {
  if (!weatherData || !Array.isArray(weatherData.hourly)) return weatherData;

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
  const hourly = periods.map((p) => {
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

  if (API?.getSnowdayWeather) return API.getSnowdayWeather();
  if (API?.getHourlyForecast) return API.getHourlyForecast();
  if (API?.getForecastHourly) return API.getForecastHourly();
  if (API?.getWeatherData) return API.getWeatherData();
  if (API?.getWeather) return API.getWeather();

  if (window.Storage?.getLastWeatherData) return window.Storage.getLastWeatherData();
  if (window.Storage?.getCachedWeather) return window.Storage.getCachedWeather();

  const loc = resolveLocation(settings);

  try {
    return await fetchOpenMeteoHourly(loc);
  } catch (e) {
    console.warn("Open-Meteo fallback failed:", e);
  }

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

    const prediction = window.SnowDayAlgorithm.calculate(weatherData, settings);

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

if (typeof window !== "undefined") {
  window.renderSnowday = renderSnowday;
  window.initSnowDayPage = initSnowDayPage;
}
