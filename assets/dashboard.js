// Dashboard page (enhanced)
window.initDashboard = async function () {
  const container = document.getElementById("dashboard-container");
  container.innerHTML = `<div class="loading">Loading dashboard…</div>`;

  try {
    const settings = window.Storage.getSettings();
    const { lat, lon } = settings.location;

    let weatherData;
    let isStale = false;

    const cached = window.Storage.getCache("weather");
    if (cached && !cached.isStale) {
      weatherData = cached.data;
    } else {
      try {
        weatherData = await window.WeatherAPI.fetchWeather(lat, lon);
        window.Storage.setCache("weather", weatherData);
      } catch (err) {
        if (cached) {
          weatherData = cached.data;
          isStale = true;
        } else {
          throw err;
        }
      }
    }

    if (isStale) {
      document.getElementById("stale-banner")?.classList.remove("hidden");
    }

    renderDashboard(container, weatherData);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="error">Failed to load dashboard.</div>`;
  }
};

function renderDashboard(container, data) {
  const hourly = data.hourly || [];
  const forecast = data.forecast || [];

  container.innerHTML = `
    <section class="card radar-card">
      <div class="card-header-row">
        <h2 class="card-title">Radar – Central Ohio (KILN)</h2>
        <button class="btn btn-small" id="radarRefresh">Refresh</button>
      </div>
      <div class="radar-wrap">
        <img id="radarImg"
             src="https://radar.weather.gov/ridge/standard/KILN_loop.gif"
             alt="NWS Radar Loop KILN">
      </div>
      <div class="card-subtle">NWS Radar • Auto-updates</div>
    </section>

    <section class="card">
      <div class="card-header-row">
        <h2 class="card-title">Hourly Trend</h2>
      </div>
      <div class="chart-wrap">
        <canvas id="hourlyChart"></canvas>
      </div>
    </section>

    <section class="card">
      <div class="card-header-row">
        <h2 class="card-title">Forecast</h2>
      </div>
      <div class="forecast-list" id="forecastList"></div>
    </section>
  `;

  setupRadar();
  renderChart(hourly);
  renderForecast(forecast);
}

/* ---------- Radar ---------- */
function setupRadar() {
  const img = document.getElementById("radarImg");
  const btn = document.getElementById("radarRefresh");
  const base = "https://radar.weather.gov/ridge/standard/KILN_loop.gif";

  const refresh = () => (img.src = `${base}?t=${Date.now()}`);
  btn.addEventListener("click", refresh);
  refresh();
  setInterval(refresh, 120000);
}

/* ---------- Forecast ---------- */
function renderForecast(periods) {
  const el = document.getElementById("forecastList");
  if (!el || !Array.isArray(periods)) return;

  el.innerHTML = periods.slice(0, 7).map(p => `
    <div class="forecast-row">
      <div>
        <div class="forecast-name">${p.name || "—"}</div>
        <div class="forecast-detail">${p.shortForecast || ""}</div>
      </div>
      <div class="forecast-side">
        <div class="forecast-temp">${p.temperature ?? "—"}°</div>
        <div class="forecast-pop">
          ${(p.probabilityOfPrecipitation?.value ?? 0)}% precip
        </div>
      </div>
    </div>
  `).join("");
}

/* ---------- Chart ---------- */
function renderChart(hourly) {
  if (!hourly.length) return;

  const ctx = document.getElementById("hourlyChart").getContext("2d");

  const labels = hourly.slice(0, 24).map(h =>
    new Date(h.time).toLocaleTimeString([], { hour: "numeric" })
  );

  const temps = hourly.slice(0, 24).map(h => h.tempF);
  const winds = hourly.slice(0, 24).map(h => h.windMph);
  const precip = hourly.slice(0, 24).map(h => h.precipIn);

  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Temp (°F)", data: temps, tension: 0.35, pointRadius: 0 },
        { label: "Wind (mph)", data: winds, tension: 0.35, pointRadius: 0 },
        { label: "Precip (in)", data: precip, tension: 0.35, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true }
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { maxTicksLimit: 6 } }
      }
    }
  });
}
