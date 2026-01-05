// Dashboard page
window.initDashboard = async function() {
  const container = document.getElementById('dashboard-container');
  container.innerHTML = '<div class="loading">Loading dashboard...</div>';
  
  try {
    const settings = window.Storage.getSettings();
    const { lat, lon } = settings.location;
    
    // Fetch weather data
    let weatherData;
    let isStale = false;
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
          isStale = true;
          document.getElementById('stale-banner').textContent = `Using cached data from ${cached.age} minutes ago. ${err.message}`;
          document.getElementById('stale-banner').classList.remove('hidden');
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
    
    // Calculate snow day prediction
    const prediction = window.SnowDayAlgorithm.calculate(weatherData, settings);
    
    // Render dashboard
    container.innerHTML = `
      <h1>Dashboard</h1>
      <p class="card-label">${settings.location.name} - Last updated: ${new Date().toLocaleTimeString()}</p>
      
      <div class="cards-grid">
        ${renderCurrentConditions(weatherData.current)}
      </div>
      
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
    `;
    
    createHourlyChart(weatherData.hourly);
    
  } catch (err) {
    container.innerHTML = `
      <div class="card">
        <div class="alert alert-danger">
          <strong>Error:</strong> ${err.message}
        </div>
      </div>
    `;
  }
};

function renderCurrentConditions(current) {
  return `
    <div class="card">
      <div class="card-header">Temperature</div>
      <div class="card-value">${Math.round(current.temperature)}°F</div>
      <div class="card-label">Feels like ${Math.round(current.feelsLike)}°F</div>
    </div>
    <div class="card">
      <div class="card-header">Conditions</div>
      <div class="card-value" style="font-size: 20px;">${current.condition}</div>
      <div class="card-label">Humidity: ${current.humidity}%</div>
    </div>
    <div class="card">
      <div class="card-header">Wind</div>
      <div class="card-value">${Math.round(current.windSpeed)} mph</div>
      <div class="card-label">${current.windGust ? 'Gusts ' + Math.round(current.windGust) + ' mph' : ''}</div>
    </div>
  `;
}

function renderSnowDayCard(prediction) {
  return `
    <div class="card">
      <div class="card-header">Snow Day Probability</div>
      <div class="card-value">${prediction.probability}%</div>
      <div class="card-label">${prediction.recommendation}</div>
      <div class="card-label" style="margin-top: 10px;">Confidence: ${prediction.confidence}%</div>
      <a href="snowday.html" class="btn btn-primary" style="margin-top: 15px; display: inline-block; text-decoration: none;">View Details</a>
    </div>
  `;
}

function renderProviderCard(data) {
  return `
    <div class="card">
      <div class="card-header">Data Source</div>
      <div class="card-value" style="font-size: 18px;">${data.source}</div>
      <div class="card-label">${data.failoverLevel === 0 ? 'Primary' : 'Backup level ' + data.failoverLevel}</div>
    </div>
  `;
}

function renderAlertsCard(alerts) {
  const active = alerts.filter(a => new Date(a.expires) > new Date());
  return `
    <div class="card">
      <div class="card-header">Active Alerts</div>
      <div class="card-value">${active.length}</div>
      <div class="card-label">${active.length > 0 ? active[0].event : 'No alerts'}</div>
      ${active.length > 0 ? '<a href="alerts.html" class="btn btn-primary" style="margin-top: 15px; display: inline-block; text-decoration: none;">View Alerts</a>' : ''}
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
  const ctx = document.getElementById('hourly-chart');
  if (!ctx) return;
  
  const hours = hourly.slice(0, 48);
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours.map(h => new Date(h.time).toLocaleString('en-US', { hour: 'numeric', day: 'numeric' })),
      datasets: [{
        label: 'Temperature (°F)',
        data: hours.map(h => h.temperature),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        yAxisID: 'y'
      }, {
        label: 'Precipitation (in)',
        data: hours.map(h => h.precipitation),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        yAxisID: 'y1'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { position: 'left', title: { display: true, text: 'Temperature' } },
        y1: { position: 'right', title: { display: true, text: 'Precipitation' }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

function renderDailyCard(day) {
  return `
    <div class="forecast-card">
      <div class="forecast-date">${new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      <div class="forecast-icon">${getWeatherIcon(day.condition)}</div>
      <div class="forecast-temp">
        <span class="forecast-high">${Math.round(day.tempHigh)}°</span> / 
        <span class="forecast-low">${Math.round(day.tempLow)}°</span>
      </div>
      <div class="card-label">${day.condition}</div>
      ${day.snowfall > 0 ? `<div class="card-label">${day.snowfall.toFixed(1)}" snow</div>` : ''}
    </div>
  `;
}

function getWeatherIcon(condition) {
  const c = condition.toLowerCase();
  if (c.includes('snow')) return '❄️';
  if (c.includes('rain')) return '🌧️';
  if (c.includes('cloud')) return '☁️';
  if (c.includes('clear')) return '☀️';
  if (c.includes('thunder')) return '⛈️';
  return '🌤️';
}
