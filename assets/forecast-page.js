// Forecast page
window.initForecastPage = async function() {
  const container = document.getElementById('forecast-container');
  container.innerHTML = '<div class="loading">Loading forecast...</div>';
  
  try {
    const settings = window.Storage.getSettings();
    const { lat, lon } = settings.location;
    
    const cached = window.Storage.getCache('weather');
    let weatherData;
    
    if (cached && !cached.isStale) {
      weatherData = cached.data;
    } else {
      weatherData = await window.WeatherAPI.fetchWeather(lat, lon);
      window.Storage.setCache('weather', weatherData);
    }
    
    container.innerHTML = `
      <h1>Detailed Forecast</h1>
      
      <div class="chart-container">
        <h2>Temperature & Precipitation</h2>
        <div class="chart-wrapper">
          <canvas id="forecast-chart"></canvas>
        </div>
      </div>
      
      <div class="card">
        <h2>Hourly Details</h2>
        <div style="overflow-x: auto;">
          <table class="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Temp</th>
                <th>Feels</th>
                <th>Precip</th>
                <th>Snow</th>
                <th>Wind</th>
                <th>Humidity</th>
              </tr>
            </thead>
            <tbody>
              ${weatherData.hourly.slice(0, 48).map(h => `
                <tr>
                  <td>${new Date(h.time).toLocaleString('en-US', { weekday: 'short', hour: 'numeric' })}</td>
                  <td>${Math.round(h.temperature)}°F</td>
                  <td>${Math.round(h.feelsLike || h.temperature)}°F</td>
                  <td>${h.precipitation.toFixed(2)}"</td>
                  <td>${h.snowfall ? h.snowfall.toFixed(2) + '"' : '-'}</td>
                  <td>${Math.round(h.windSpeed)} mph</td>
                  <td>${Math.round(h.humidity)}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    createForecastChart(weatherData.hourly);
    
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="alert alert-danger">Error: ${err.message}</div></div>`;
  }
};

function createForecastChart(hourly) {
  const ctx = document.getElementById('forecast-chart');
  if (!ctx) return;
  
  const hours = hourly.slice(0, 48);
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours.map(h => new Date(h.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })),
      datasets: [{
        label: 'Temperature (°F)',
        data: hours.map(h => h.temperature),
        borderColor: '#ef4444',
        tension: 0.4
      }, {
        label: 'Wind Speed (mph)',
        data: hours.map(h => h.windSpeed),
        borderColor: '#10b981',
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}
