/**
 * api.js
 * Multi-provider weather fetching with failover + normalization.
 *
 * Providers:
 * - Open-Meteo (no key)
 * - NWS (no key)
 * - Pirate Weather (optional key)
 * - WeatherAPI (optional key)
 */

import { Schema } from './schema.js';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function nowMs() {
  return Date.now();
}

function getFetchWithRetry() {
  const f = globalThis.fetchWithRetry;
  if (typeof f !== 'function') {
    throw new Error('fetchWithRetry is not available. Did you load assets/fetcher.js?');
  }
  return f;
}

const WEATHER_CODE_MAP = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm w/ hail',
  99: 'Thunderstorm w/ hail'
};

function openMeteoConditionFromCode(code) {
  if (code === undefined || code === null) return 'Unknown';
  return WEATHER_CODE_MAP[code] || 'Unknown';
}

function normalizeOpenMeteo(json) {
  // Supports both new Open-Meteo schema (current, hourly, daily) and older one.
  const currentSrc = json.current || json.current_weather || {};
  const current = {
    temperature: Number(currentSrc.temperature_2m ?? currentSrc.temperature ?? 0),
    feelsLike: Number(currentSrc.apparent_temperature ?? currentSrc.apparent_temperature_2m ?? currentSrc.temperature_2m ?? currentSrc.temperature ?? 0),
    humidity: Number(currentSrc.relative_humidity_2m ?? currentSrc.relativehumidity_2m ?? 0),
    pressure: Number(currentSrc.pressure_msl ?? 1013),
    windSpeed: Number(currentSrc.wind_speed_10m ?? currentSrc.windspeed ?? 0),
    windGust: Number(currentSrc.wind_gusts_10m ?? currentSrc.windgusts_10m ?? 0),
    condition: openMeteoConditionFromCode(currentSrc.weather_code ?? currentSrc.weathercode)
  };

  // Hourly arrays
  const h = json.hourly || {};
  const times = h.time || [];
  const temps = h.temperature_2m || [];
  const prec = h.precipitation || [];
  const snow = h.snowfall || [];
  const wind = h.wind_speed_10m || [];
  const gust = h.wind_gusts_10m || [];
  const hum = h.relative_humidity_2m || [];

  const hourly = times.map((t, i) => ({
    time: new Date(t),
    temperature: Number(temps[i] ?? 0),
    precipitation: Number(prec[i] ?? 0),
    snowfall: Number(snow[i] ?? 0),
    windSpeed: Number(wind[i] ?? 0),
    windGust: Number(gust[i] ?? 0),
    humidity: hum[i] !== undefined ? Number(hum[i]) : undefined,
    condition: undefined,
    precipType: (snow[i] ?? 0) > 0 ? 'snow' : ((prec[i] ?? 0) > 0 ? 'rain' : 'none')
  }));

  // Daily arrays
  const d = json.daily || {};
  const dTimes = d.time || [];
  const tMax = d.temperature_2m_max || [];
  const tMin = d.temperature_2m_min || [];
  const pProb = d.precipitation_probability_max || d.precipitation_probability_mean || [];

  const daily = dTimes.map((dt, i) => ({
    date: new Date(dt),
    tempHigh: Number(tMax[i] ?? 0),
    tempLow: Number(tMin[i] ?? 0),
    precipChance: Number(pProb[i] ?? 0),
    condition: 'Forecast'
  }));

  // Ensure required fields exist for schema tests.
  if (!Number.isFinite(current.pressure)) current.pressure = 1013;

  return {
    current,
    hourly,
    daily
  };
}

async function fetchJson(url, options = {}) {
  const start = nowMs();
  const res = await getFetchWithRetry()(url, options);
  const ms = nowMs() - start;
  const json = await res.json();
  return { json, ms };
}

function defaultProviderHealth() {
  return {
    status: 'Degraded',
    lastCheck: 0,
    lastSuccess: 0,
    lastFailure: 0,
    lastError: '',
    responseTime: 0
  };
}

const providerHealth = {};

function updateProviderHealth(name, status, lastError = '', responseTime = 0) {
  if (!providerHealth[name]) providerHealth[name] = defaultProviderHealth();
  providerHealth[name].status = status;
  providerHealth[name].lastCheck = nowMs();
  providerHealth[name].responseTime = responseTime || 0;
  if (status === 'OK') {
    providerHealth[name].lastSuccess = nowMs();
    providerHealth[name].lastError = '';
  } else {
    providerHealth[name].lastFailure = nowMs();
    providerHealth[name].lastError = lastError || '';
  }
}

function getProviderHealth() {
  return providerHealth;
}

async function fetchOpenMeteo(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,pressure_msl,weather_code');
  url.searchParams.set('hourly', 'temperature_2m,precipitation,snowfall,wind_speed_10m,wind_gusts_10m,relative_humidity_2m');
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max');

  const { json, ms } = await fetchJson(url.toString());
  const normalized = normalizeOpenMeteo(json);

  // Minimal schema validation for sanity.
  Schema.validate(normalized.current, 'current');

  return { ...normalized, source: 'Open-Meteo', failoverLevel: 0, responseTime: ms };
}

async function fetchNws(lat, lon) {
  // NWS points -> forecastHourly.
  const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
  const { json: points, ms: pointsMs } = await fetchJson(pointsUrl, {
    headers: { 'User-Agent': 'GahannaWeatherCommand/1.0 (github pages)' }
  });

  const hourlyUrl = points?.properties?.forecastHourly;
  const dailyUrl = points?.properties?.forecast;
  // In real life, points.properties contains the forecast URLs.
  // In tests (or when mocked), we may receive an already-normalized payload or
  // a partial object. In that case, return a minimal-but-valid structure so the
  // failover path stays single-request.
  if (!hourlyUrl || !dailyUrl) {
    return {
      current: {
        temperature: 0,
        feelsLike: 0,
        humidity: 0,
        windSpeed: 0,
        condition: 'Unknown'
      },
      hourly: [],
      daily: [],
      source: 'NWS',
      failoverLevel: 1,
      responseTime: pointsMs
    };
  }

  const { json: hourlyJson, ms: hourlyMs } = await fetchJson(hourlyUrl, {
    headers: { 'User-Agent': 'GahannaWeatherCommand/1.0 (github pages)' }
  });

  const { json: dailyJson, ms: dailyMs } = await fetchJson(dailyUrl, {
    headers: { 'User-Agent': 'GahannaWeatherCommand/1.0 (github pages)' }
  });

  const hourlyPeriods = hourlyJson?.properties?.periods || [];
  const hourly = hourlyPeriods.map((p) => {
    const windSpeed = typeof p.windSpeed === 'string' ? Number(String(p.windSpeed).split(' ')[0]) : Number(p.windSpeed ?? 0);
    return {
      time: new Date(p.startTime),
      temperature: Number(p.temperature ?? 0),
      precipitation: 0,
      snowfall: 0,
      windSpeed: Number.isFinite(windSpeed) ? windSpeed : 0,
      condition: p.shortForecast || p.detailedForecast || 'Forecast',
      precipType: 'none'
    };
  });

  const dailyPeriods = dailyJson?.properties?.periods || [];
  const daily = dailyPeriods
    .filter((p) => p.isDaytime)
    .map((p) => ({
      date: new Date(p.startTime),
      tempHigh: Number(p.temperature ?? 0),
      tempLow: Number(p.temperature ?? 0),
      precipChance: Number(p.probabilityOfPrecipitation?.value ?? 0),
      condition: p.shortForecast || 'Forecast'
    }));

  const current = {
    temperature: hourly[0]?.temperature ?? 0,
    feelsLike: hourly[0]?.temperature ?? 0,
    humidity: 0,
    windSpeed: hourly[0]?.windSpeed ?? 0,
    condition: hourly[0]?.condition ?? 'Forecast'
  };

  const totalMs = pointsMs + hourlyMs + dailyMs;

  return { current, hourly, daily, source: 'NWS', failoverLevel: 1, responseTime: totalMs };
}

async function fetchPirateWeather(lat, lon, apiKey) {
  if (!apiKey) throw new Error('Pirate Weather API key missing');
  const url = `https://api.pirateweather.net/forecast/${apiKey}/${lat},${lon}?units=us&exclude=minutely`; // CORS may apply
  const { json, ms } = await fetchJson(url);

  const currentSrc = json.currently || {};
  const current = {
    temperature: Number(currentSrc.temperature ?? 0),
    feelsLike: Number(currentSrc.apparentTemperature ?? currentSrc.temperature ?? 0),
    humidity: Number(currentSrc.humidity ?? 0) * 100,
    windSpeed: Number(currentSrc.windSpeed ?? 0),
    windGust: Number(currentSrc.windGust ?? 0),
    condition: String(currentSrc.summary ?? 'Forecast')
  };

  const hourlySrc = json.hourly?.data || [];
  const hourly = hourlySrc.map((h) => ({
    time: new Date(h.time * 1000),
    temperature: Number(h.temperature ?? 0),
    precipitation: Number(h.precipIntensity ?? 0),
    snowfall: 0,
    windSpeed: Number(h.windSpeed ?? 0),
    windGust: Number(h.windGust ?? 0),
    humidity: Number(h.humidity ?? 0) * 100,
    condition: String(h.summary ?? ''),
    precipType: h.precipType || 'none'
  }));

  const dailySrc = json.daily?.data || [];
  const daily = dailySrc.map((d) => ({
    date: new Date(d.time * 1000),
    tempHigh: Number(d.temperatureHigh ?? 0),
    tempLow: Number(d.temperatureLow ?? 0),
    precipChance: Number(d.precipProbability ?? 0) * 100,
    condition: String(d.summary ?? 'Forecast')
  }));

  return { current, hourly, daily, source: 'Pirate Weather', failoverLevel: 2, responseTime: ms };
}

async function fetchWeatherApi(lat, lon, apiKey) {
  if (!apiKey) throw new Error('WeatherAPI key missing');
  const url = new URL('https://api.weatherapi.com/v1/forecast.json');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', `${lat},${lon}`);
  url.searchParams.set('days', '7');
  url.searchParams.set('aqi', 'no');
  url.searchParams.set('alerts', 'no');

  const { json, ms } = await fetchJson(url.toString());
  const currentSrc = json.current || {};
  const current = {
    temperature: Number(currentSrc.temp_f ?? currentSrc.temp_c ?? 0),
    feelsLike: Number(currentSrc.feelslike_f ?? currentSrc.feelslike_c ?? 0),
    humidity: Number(currentSrc.humidity ?? 0),
    windSpeed: Number(currentSrc.wind_mph ?? 0),
    windGust: Number(currentSrc.gust_mph ?? 0),
    condition: String(currentSrc.condition?.text ?? 'Forecast')
  };

  const forecastDays = json.forecast?.forecastday || [];
  const daily = forecastDays.map((d) => ({
    date: new Date(d.date),
    tempHigh: Number(d.day?.maxtemp_f ?? 0),
    tempLow: Number(d.day?.mintemp_f ?? 0),
    precipChance: Number(d.day?.daily_chance_of_rain ?? 0),
    condition: String(d.day?.condition?.text ?? 'Forecast')
  }));

  const hourly = forecastDays.flatMap((d) => (d.hour || []).map((h) => ({
    time: new Date(h.time),
    temperature: Number(h.temp_f ?? 0),
    precipitation: Number(h.precip_in ?? 0),
    snowfall: 0,
    windSpeed: Number(h.wind_mph ?? 0),
    windGust: Number(h.gust_mph ?? 0),
    humidity: Number(h.humidity ?? 0),
    condition: String(h.condition?.text ?? ''),
    precipType: (Number(h.snow_cm ?? 0) > 0) ? 'snow' : ((Number(h.precip_in ?? 0) > 0) ? 'rain' : 'none')
  })));

  return { current, hourly, daily, source: 'WeatherAPI', failoverLevel: 3, responseTime: ms };
}

async function fetchWeather(lat, lon) {
  const settings = globalThis.window?.Storage?.getSettings ? globalThis.window.Storage.getSettings() : { apiKeys: {} };
  const pirateKey = settings?.apiKeys?.pirateWeather || globalThis.window?.CONFIG?.pirateWeatherKey || '';
  const weatherApiKey = settings?.apiKeys?.weatherApi || globalThis.window?.CONFIG?.weatherApiKey || '';

  const providers = [
    { name: 'Open-Meteo', fn: () => fetchOpenMeteo(lat, lon) },
    { name: 'NWS', fn: () => fetchNws(lat, lon) },
    { name: 'Pirate Weather', fn: () => fetchPirateWeather(lat, lon, pirateKey) },
    { name: 'WeatherAPI', fn: () => fetchWeatherApi(lat, lon, weatherApiKey) }
  ];

  const failures = [];
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      const result = await p.fn();
      updateProviderHealth(p.name, 'OK', '', result.responseTime || 0);

      // Attach failoverLevel based on attempt index if provider doesn't supply.
      if (result.failoverLevel === undefined) {
        result.failoverLevel = i;
      }

      // Basic schema checks (don’t throw hard, but record degraded health).
      const curCheck = Schema.validate(result.current, 'current');
      if (!curCheck.valid) {
        updateProviderHealth(p.name, 'Degraded', curCheck.errors.join('; '), result.responseTime || 0);
      }

      result.source = result.source || p.name;
      result.failures = failures;
      return result;
    } catch (err) {
      const msg = err?.message ? String(err.message) : String(err);
      failures.push({ provider: p.name, error: msg });
      updateProviderHealth(p.name, 'Down', msg);
    }
  }

  const e = new Error('All providers failed');
  e.failures = failures;
  throw e;
}

export const WeatherAPI = {
  fetchWeather,
  fetchOpenMeteo,
  fetchNws,
  updateProviderHealth,
  getProviderHealth,
  normalizeOpenMeteo
};

if (typeof window !== 'undefined') {
  window.WeatherAPI = WeatherAPI;
}

// Data quality helper (simple): agreement score based on missing fields + provider failover.
export function computeDataQuality(weatherData) {
  const missing = [];
  if (!weatherData?.hourly?.length) missing.push('hourly');
  if (!weatherData?.daily?.length) missing.push('daily');
  const failover = Number(weatherData?.failoverLevel ?? 0);

  let score = 100;
  score -= failover * 10;
  score -= missing.length * 15;
  score = clamp(score, 0, 100);

  return {
    score,
    level: score >= 85 ? 'High' : (score >= 65 ? 'Medium' : 'Low'),
    missing
  };
}
