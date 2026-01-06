// Dashboard page (modern dark layout)
window.initDashboard = async function () {
  const container = document.getElementById("dashboard-container");
  container.innerHTML = '<div class="loading">Loading dashboard...</div>';

  try {
    const settings = window.Storage.getSettings();
    const { lat, lon } = settings.location;

    // Weather with cache + stale fallback
    let weatherData;
    const cached = window.Storage.getCache("weather");
    let staleNote = "";

    if (cached && !cached.isStale) {
      weatherData = cached.data;
    } else {
      try {
        weatherData = await window.WeatherAPI.fetchWeather(lat, lon);
        window.Storage.setCache("weather", weatherData);
      } catch (err) {
        if (cached) {
          weatherData = cached.data;
          staleNote = `Using cached data (${cached.age} min old). Live fetch failed: ${err.message}`;
          const banner = document.getElementById("stale-banner");
          if (banner) {
            banner.textContent = staleNote;
            banner.classList.remove("hidden");
          }
        } else {
          throw err;
        }
      }
    }

    // Alerts (best-effort)
    let alerts = [];
    try {
      alerts = await window.AlertsAPI.fetchAlerts(lat, lon);
    } catch (err) {
      console.warn("Alerts fetch failed:", err);
    }

    // Snowday (best-effort)
    let prediction = null;
    try {
      if (window.SnowDayAlgorithm?.calculate) {
        prediction = window.SnowDayAlgorithm.calculate(weatherData, settings);
      }
    } catch (err) {
      console.warn("SnowDay calc failed:", err);
    }

    container.innerHTML = `
      <div class="dash-shell">
        <div class="dash-head">
          <div>
            <h1 class="dash-title">Dashboard</h1>
            <div class="dash-subtitle">Gahanna Weather Command • Live overview</div>
          </div>
          <div class="dash-actions">
            <button class="btn btn-small" id="dashRefreshBtn" type="button">Refresh</button>
          </div>
        </div>

        <div class="dash-grid">
          <!-- LEFT / MAIN -->
          <div class="dash-main">

            <!-- Top stat cards -->
            <div class="dash-stats">
              ${renderCurrentCard(weatherData.current)}
              ${renderSnowDayCard(prediction)}
              ${renderAlertsMini(alerts)}
              ${renderSourceCard(weatherData)}
            </div>

            <!-- Big chart -->
            <section class="card dash-card">
              <div class="dash-card-head">
                <div>
                  <div class="dash-card-title">48-Hour Trend</div>
                  <div class="dash-card-sub">Temperature • Precipitation</div>
                </div>
              </div>
              <div class="dash-chart-wrap">
                <canvas id="hourly-chart"></canvas>
              </div>
            </section>

            <!-- Forecast -->
            <section class="card dash-card">
              <div class="dash-card-head">
                <div>
                  <div class="dash-card-title">7-Day Forecast</div>
                  <div class="dash-card-sub">High / Low • Precip chance</div>
                </div>
              </div>

              <div class="dash-forecast-grid">
                ${(weatherData.daily || []).slice(0, 7).map(d => renderDailyCardPretty(d)).join("")}
              </div>
            </section>
          </div>

          <!-- RIGHT / SIDE -->
          <div class="dash-side">
            <!-- Radar -->
            <section class="card dash-card">
              <div class="dash-card-head dash-row">
                <div>
                  <div class="dash-card-title">Radar Loop</div>
                  <div class="dash-card-sub">NWS KILN (Central Ohio)</div>
                </div>
                <button class="btn btn-small" id="radarRefreshBtn" type="button">Refresh</button>
              </div>

              <div class="dash-radar-wrap">
                <img
                  id="radarImg"
                  class="dash-radar-img"
                  src="https://radar.weather.gov/ridge/standard/KILN_loop.gif"
                  alt="NWS radar loop KILN"
                  loading="lazy"
                />
              </div>

              <div class="dash-footnote">Auto-refreshes every 2 minutes</div>
            </section>

            <!-- Alerts list -->
            <section class="card dash-card">
              <div class="dash-card-head">
                <div>
                  <div class="dash-card-title">Alerts</div>
                  <div class="dash-card-sub">${formatAlertCount(alerts)}</div>
                </div>
              </div>

              <div class="dash-alerts-list">
                ${renderAlertsList(alerts)}
              </div>

              <div class="dash-card-actions">
                <a class="btn btn-small" href="alerts.html">Open Alerts Page</a>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;

    // Hook refresh buttons
    document.getElementById("dashRefreshBtn")?.addEventListener("click", () => location.reload());

    hookRadarLoop();
    createHourlyChart(weatherData.hourly);

  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="card">
        <div class="card-header">Error</div>
        <div class="card-label">Dashboard failed to load.</div>
        <pre style="white-space:pre-wrap;overflow:auto;margin:0;">${String(err?.message || err)}</pre>
      </div>
    `;
  }
};

/* ---------------- Radar helpers ---------------- */

function hookRadarLoop() {
  const img = document.getElementById("radarImg");
  const btn = document.getElementById("radarRefreshBtn");
  if (!img) return;

  const base = "https://radar.weather.gov/ridge/standard/KILN_loop.gif";
  const refresh = () => (img.src = `${base}?t=${Date.now()}`);

  btn?.addEventListener("click", refresh);
  refresh();
  window.setInterval(refresh, 120000);
}

/* ---------------- Cards (top stats) ---------------- */

function renderCurrentCard(current) {
  const temp = Math.round(current?.temperature ?? 0);
  const feel = Math.round(current?.feelsLike ?? 0);
  const wind = Math.round(current?.windSpeed ?? 0);
  const hum = Math.round(current?.humidity ?? 0);
  const cond = current?.condition ?? "—";

  return `
    <div class="card dash-stat">
      <div class="dash-stat-kicker">Now</div>
      <div class="dash-stat-main">
        <div class="dash-stat-big">${temp}°</div>
        <div class="dash-stat-sub">${cond}</div>
      </div>
      <div class="dash-stat-meta">
        <div><span>Feels</span><b>${feel}°</b></div>
        <div><span>Wind</span><b>${wind} mph</b></div>
        <div><span>Humidity</span><b>${hum}%</b></div>
      </div>
    </div>
  `;
}

function renderSnowDayCard(prediction) {
  if (!prediction) {
    return `
      <div class="card dash-stat">
        <div class="dash-stat-kicker">Snow Day</div>
        <div class="dash-stat-main">
          <div class="dash-stat-big">—</div>
          <div class="dash-stat-sub">Model unavailable</div>
        </div>
        <div class="dash-stat-meta">
          <div><span>Status</span><b>Check Snow Day page</b></div>
        </div>
      </div>
    `;
  }

  const p = Number(prediction.probability ?? 0);
  const rec = prediction.recommendation ?? "—";

  return `
    <div class="card dash-stat">
      <div class="dash-stat-kicker">Snow Day</div>
      <div class="dash-stat-main">
        <div class="dash-stat-big">${p}%</div>
        <div class="dash-stat-sub">${rec}</div>
      </div>
      <div class="dash-stat-meta">
        <div><span>Confidence</span><b>${Number(prediction.confidence ?? 0)}%</b></div>
        <div><span>Adj</span><b>${(prediction.humanAdjustment ?? 0) >= 0 ? "+" : ""}${prediction.humanAdjustment ?? 0}</b></div>
      </div>
    </div>
  `;
}

function renderAlertsMini(alerts) {
  const active = (Array.isArray(alerts) ? alerts : []).filter(a => new Date(a.expires) > new Date());
  const count = active.length;
  const top = count ? active[0].event : "No active alerts";

  return `
    <div class="card dash-stat">
      <div class="dash-stat-kicker">Alerts</div>
      <div class="dash-stat-main">
        <div class="dash-stat-big">${count}</div>
        <div class="dash-stat-sub">${top}</div>
      </div>
      <div class="dash-stat-meta">
        <div><span>View</span><b><a href="alerts.html" class="dash-link">alerts page</a></b></div>
      </div>
    </div>
  `;
}

function renderSourceCard(weatherData) {
  const src = weatherData?.source ?? weatherData?.meta?.provider ?? "Auto";
  const level = Number(weatherData?.failoverLevel ?? weatherData?.meta?.failoverLevel ?? 0);
  const mode = level === 0 ? "Primary" : `Backup L${level}`;

  return `
    <div class="card dash-stat">
      <div class="dash-stat-kicker">Data</div>
      <div class="dash-stat-main">
        <div class="dash-stat-big" style="font-size:18px;">${escapeHtml(String(src))}</div>
        <div class="dash-stat-sub">${mode}</div>
      </div>
      <div class="dash-stat-meta">
        <div><span>Failover</span><b>${level}</b></div>
      </div>
    </div>
  `;
}

/* ---------------- Forecast cards ---------------- */

function renderDailyCardPretty(day) {
  const date = new Date(day.date);
  const dow = date.toLocaleDateString("en-US", { weekday: "short" });
  const mon = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const hi = Math.round(day.tempHigh ?? 0);
  const lo = Math.round(day.tempLow ?? 0);
  const pop = Math.round(day.precipChance ?? 0);
  const cond = day.condition ?? "Forecast";
  const icon = getWeatherIcon(cond);
  const snow = Number(day.snowfall ?? 0);

  return `
    <div class="dash-forecast-card">
      <div class="dash-forecast-top">
        <div>
          <div class="dash-forecast-dow">${dow}</div>
          <div class="dash-forecast-date">${mon}</div>
        </div>
        <div class="dash-forecast-icon">${icon}</div>
      </div>

      <div class="dash-forecast-temps">
        <span class="dash-forecast-hi">${hi}°</span>
        <span class="dash-forecast-lo">${lo}°</span>
      </div>

      <div class="dash-forecast-cond">${escapeHtml(cond)}</div>
      <div class="dash-forecast-meta">
        <span>${pop}% precip</span>
        ${snow > 0 ? `<span>${snow.toFixed(1)}" snow</span>` : `<span>&nbsp;</span>`}
      </div>
    </div>
  `;
}

/* ---------------- Alerts list ---------------- */

function formatAlertCount(alerts) {
  const active = (Array.isArray(alerts) ? alerts : []).filter(a => new Date(a.expires) > new Date());
  return active.length ? `${active.length} active` : "None active";
}

function renderAlertsList(alerts) {
  const active = (Array.isArray(alerts) ? alerts : []).filter(a => new Date(a.expires) > new Date());
  if (!active.length) {
    return `<div class="dash-empty">No active alerts.</div>`;
  }

  return active.slice(0, 6).map(a => {
    const exp = new Date(a.expires).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
    return `
      <div class="dash-alert-item">
        <div class="dash-alert-title">${escapeHtml(a.event ?? "Alert")}</div>
        <div class="dash-alert-sub">Expires: ${escapeHtml(exp)}</div>
      </div>
    `;
  }).join("");
}

/* ---------------- Chart (Temp + Precip) ---------------- */

function createHourlyChart(hourly) {
  const canvas = document.getElementById("hourly-chart");
  if (!canvas || !Array.isArray(hourly) || hourly.length === 0) return;

  // prevent double charts on reload / nav
  if (canvas._chart) {
    try { canvas._chart.destroy(); } catch {}
  }

  const hours = hourly.slice(0, 48);
  const labels = hours.map(h => new Date(h.time).toLocaleString([], { weekday: "short", hour: "numeric" }));

  const temps = hours.map(h => Number(h.temperature ?? 0));
  const precip = hours.map(h => Number(h.precipitation ?? 0));

  const chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Temp (°F)", data: temps, tension: 0.35, pointRadius: 0, yAxisID: "y" },
        { label: "Precip (in)", data: precip, tension: 0.35, pointRadius: 0, yAxisID: "y1" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { position: "left", ticks: { maxTicksLimit: 6 }, title: { display: true, text: "Temp (°F)" } },
        y1: { position: "right", ticks: { maxTicksLimit: 6 }, grid: { drawOnChartArea: false }, title: { display: true, text: "Precip (in)" } }
      }
    }
  });

  canvas._chart = chart;
}

/* ---------------- Small utilities ---------------- */

function getWeatherIcon(condition) {
  const c = String(condition || "").toLowerCase();
  if (c.includes("snow")) return "❄️";
  if (c.includes("rain")) return "🌧️";
  if (c.includes("cloud")) return "☁️";
  if (c.includes("clear")) return "☀️";
  if (c.includes("thunder") || c.includes("storm")) return "⛈️";
  return "🌤️";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
