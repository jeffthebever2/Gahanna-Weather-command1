// Dashboard page
window.initDashboard = async function() {
  const container = document.getElementById('dashboard-container');
  container.innerHTML = '<div class="loading">Loading dashboard...</div>';

  try {
    const settings = window.Storage.getSettings();
    const { lat, lon } = settings.location;

    // Fetch weather data
    let weatherData;
    const cached = window.Storage.getCache('weather');

    if (cached && !cached.isStale) {
      weatherData = cached.data;
    } else {
      try {
        weatherData = await window.WeatherAPI.fetchWeather(lat, lon);
        window.Storage.setCache('weather', weatherData);
      } catch (err) {
        if (cached) {
          weatherData = cached.data;
          const banner = document.getElementById('stale-banner');
          if (banner) {
            banner.textContent = `Using cached data from ${cached.age} minutes ago. ${err.message}`;
            banner.classList.remove('hidden');
          }
        } else {
          throw err;
        }
      }
    }

    // Fetch alerts
    let alerts = [];
    try {
      alerts = await window.AlertsAPI.fetchAlerts(lat, lon);
    } catch (err) {
      console.error('Alerts fetch failed:', err);
    }

    // Snow day prediction (if available)
    let prediction = null;
    try {
      if (window.SnowDayAlgorithm?.calculate) {
        prediction = window.SnowDayAlgorithm.calculate(weatherData, settings);
      }
    } catch (err) {
      console.error('SnowDay calculate failed:', err);
    }

    container.innerHTML = `
      <div class="dashboard">
        <h1>Dashboard</h1>

        ${renderCurrentConditions(weatherData.current)}

        <!-- Radar (NEW, but contained) -->
        ${renderRadarCard()}

        <div class="cards-grid">
          ${renderSnowDayCard(prediction)}
          ${renderProviderCard(weatherData)}
          ${renderAlertsCard(alerts)}
        </div>

        ${renderHourlyChart(weatherData.hourly)}

        <h2>7-Day Forecast</h2>
        <div class="forecast-grid">
          ${weatherData.daily.slice(0, 7).map(d => renderDailyCard(d)).join('')}
        </div>
      </div>
    `;

    // IMPORTANT: must run AFTER the canvas exists
    createHourlyChart(weatherData.hourly);
    hookRadarRefresh();

  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="card">
        <div class="card-header">Error</div>
        <div class="card-label">Failed to load dashboard.</div>
        <pre style="white-space:pre-wrap;overflow:auto;margin:0;">${String(err?.message || err)}</pre>
      </div>
    `;
  }
};

/* ---------------- NEW: Radar ---------------- */

function renderRadarCard() {
  return `
    <div class="card radar-card">
      <div class="card-header-row">
        <div class="card-header">Radar Loop (KILN)</div>
        <button class="btn btn-small" id="radar-refresh" type="button">Refresh</button>
      </div>

      <div class="radar-wrap">
        <img
          id="radar-img"
          class="radar-img"
          src="https://radar.weather.gov/ridge/standard/KILN_loop.gif"
          alt="NWS Radar Loop for KILN"
          loading="lazy"
        />
      </div>

      <div class="card-label">NWS Ridge • Central Ohio</div>
    </div>
  `;
}

function hookRadarRefresh() {
  const img = document.getElementById('radar-img');
  const btn = document.getElementById('radar-refresh');
  if (!img) return;

  const base = 'https://radar.weather.gov/ridge/standard/KILN_loop.gif';
  const refresh = () => { img.src = `${base}?t=${Date.now()}`; };

  btn?.addEventListener('click', refresh);

  // Auto refresh every 2 minutes
  refresh();
  window.setInterval(refresh, 120000);
}

/* ---------------- Existing UI helpers ---------------- */

function renderCurrentConditions(current) {
  return `
    <div class="card">
      <div class="card-header">Current Conditions</div>
      <div class="current-temp">${Math.round(current.temperature)}°</div>
      <div class="card-label">${current.condition ?? ''}</div>
      <div class="current-grid">
        <div class="current-item">
          <div class="current-label">Feels Like</div>
          <div class="current-value">${Math.round(current.feelsLike)}°</div>
        </div>
        <div class="current-item">
          <div class="current-label">Wind</div>
          <div class="current-value">${Math.round(current.windSpeed)} mph</div>
        </div>
        <div class="current-item">
          <div class="current-label">Humidity</div>
          <div class="current-value">${Math.round(current.humidity)}%</div>
        </div>
        <div class="current-item">
          <div class="current-label">Pressure</div>
          <div class="current-value">${Math.round(current.pressure)} mb</div>
        </div>
      </div>
    </div>
  `;
}

function renderSnowDayCard(prediction) {
  if (!prediction) {
    return `
      <div class="card">
        <div class="card-header">Snow Day</div>
        <div class="card-label">Snow day model not available.</div>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header">Snow Day</div>
      <div class="card-value">${prediction.probability}%</div>
      <div class="card-label">${prediction.recommendation}</div>
    </div>
  `;
}

function renderProviderCard(weatherData) {
  const p = weatherData?.meta?.provider || weatherData?.provider || 'Auto';
  const f = weatherData?.meta?.failoverLevel ?? weatherData?.failoverLevel ?? 0;

  return `
    <div class="card">
      <div class="card-header">Data Source</div>
      <div class="card-value">${p}</div>
      <div class="card-label">Failover: ${f}</div>
    </div>
  `;
}

function renderAlertsCard(alerts) {
  const count = Array.isArray(alerts) ? alerts.length : 0;

  return `
    <div class="card">
      <div class="card-header">Alerts</div>
      <div class="card-value">${count}</div>
      <div class="card-label">${count ? 'Active alerts' : 'No active alerts'}</div>
    </div>
  `;
}

function renderHourlyChart(hourly) {
  return `
    <div class="chart-container">
      <h2>48-Hour Forecast</h2>
      <div class="chart-wrapper">
        <canvas id="hourly-chart"></canvas>
      </div>
    </div>
  `;
}

function createHourlyChart(hourly) {
  const canvas = document.getElementById('hourly-chart');
  if (!canvas || !Array.isArray(hourly) || hourly.length === 0) return;

  const hours = hourly.slice(0, 48);

  // Destroy any existing chart if you navigate back/forward
  if (canvas._chart) {
    try { canvas._chart.destroy(); } catch {}
  }

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: hours.map(h =>
        new Date(h.time).toLocaleString('en-US', { weekday: 'short', hour: 'numeric' })
      ),
      datasets: [{
        label: 'Temperature (°F)',
        data: hours.map(h => h.temperature),
        yAxisID: 'y'
      }, {
        label: 'Precipitation (in)',
        data: hours.map(h => h.precipitation),
        yAxisID: 'y1'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true },
        tooltip: { enabled: true }
      },
      scales: {
        x: { grid: { display: false } },
        y: { position: 'left', title: { display: true, text: 'Temp (°F)' } },
        y1: { position: 'right', title: { display: true, text: 'Precip (in)' }, grid: { drawOnChartArea: false } }
      }
    }
  });

  canvas._chart = chart;
}

function renderDailyCard(day) {
  const dateStr = new Date(day.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  const precip = day.precipChance ?? 0;

  return `
    <div class="forecast-card">
      <div class="forecast-date">${dateStr}</div>
      <div class="forecast-icon">${getWeatherIcon(day.condition)}</div>
      <div class="forecast-temp">
        <span class="forecast-high">${Math.round(day.tempHigh)}°</span> /
        <span class="forecast-low">${Math.round(day.tempLow)}°</span>
      </div>
      <div class="card-label">${day.condition}</div>
      <div class="card-label">${Math.round(precip)}% precip</div>
      ${day.snowfall > 0 ? `<div class="card-label">${day.snowfall.toFixed(1)}" snow</div>` : ''}
    </div>
  `;
}

function getWeatherIcon(condition) {
  const c = (condition || '').toLowerCase();
  if (c.includes('snow')) return '❄️';
  if (c.includes('rain')) return '🌧️';
  if (c.includes('cloud')) return '☁️';
  if (c.includes('clear')) return '☀️';
  if (c.includes('storm') || c.includes('thunder')) return '⛈️';
  return '🌤️';
}
