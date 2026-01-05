// Settings page
window.initSettingsPage = function() {
  const container = document.getElementById('settings-container');
  const settings = window.Storage.getSettings();
  
  container.innerHTML = `
    <form id="settings-form">
      <div class="card">
        <h2>Location</h2>
        <div class="form-group">
          <label class="form-label">District Name</label>
          <input type="text" class="form-input" name="districtName" value="${settings.location.district}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Latitude</label>
          <input type="number" step="0.0001" class="form-input" name="lat" value="${settings.location.lat}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Longitude</label>
          <input type="number" step="0.0001" class="form-input" name="lon" value="${settings.location.lon}" required>
        </div>
      </div>
      
      <div class="card">
        <h2>School Times</h2>
        <div class="form-group">
          <label class="form-label">Bus Time</label>
          <input type="time" class="form-input" name="busTime" value="${settings.schoolTimes.busTime}" required>
        </div>
        <div class="form-group">
          <label class="form-label">First Bell</label>
          <input type="time" class="form-input" name="firstBell" value="${settings.schoolTimes.firstBell}" required>
        </div>
      </div>
      
      <div class="card">
        <h2>District Sensitivity</h2>
        <div class="form-group">
          <label class="form-label">Closure Tendency</label>
          <select class="form-select" name="sensitivity">
            <option value="conservative" ${settings.districtSensitivity === 'conservative' ? 'selected' : ''}>Conservative (closes more readily)</option>
            <option value="normal" ${settings.districtSensitivity === 'normal' ? 'selected' : ''}>Normal</option>
            <option value="aggressive" ${settings.districtSensitivity === 'aggressive' ? 'selected' : ''}>Aggressive (stays open when possible)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" name="ruralRoutes" ${settings.districtFactors.ruralBusRoutes ? 'checked' : ''}>
            Rural bus routes (increases closure probability)
          </label>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" name="hillyRoads" ${settings.districtFactors.hillyRoads ? 'checked' : ''}>
            Hilly roads (increases closure probability)
          </label>
        </div>
      </div>
      
      <div class="card">
        <h2>API Keys (Optional)</h2>
        <div class="form-group">
          <label class="form-label">Pirate Weather API Key</label>
          <input type="text" class="form-input" name="pirateKey" value="${settings.apiKeys.pirateWeather}" placeholder="Optional">
          <p class="form-help">Get free key at <a href="https://pirateweather.net" target="_blank">pirateweather.net</a></p>
        </div>
        <div class="form-group">
          <label class="form-label">WeatherAPI Key</label>
          <input type="text" class="form-input" name="weatherApiKey" value="${settings.apiKeys.weatherApi}" placeholder="Optional">
          <p class="form-help">Get free key at <a href="https://weatherapi.com" target="_blank">weatherapi.com</a></p>
        </div>
      </div>
      
      <div class="card">
        <h2>Feed URLs</h2>
        <div class="form-group">
          <label class="form-label">RSS Feeds (one per line)</label>
          <textarea class="form-textarea" name="feeds" rows="5">${settings.feedUrls.join('\n')}</textarea>
        </div>
      </div>
      
      <div class="card">
        <h2>Data Management</h2>
        <button type="button" class="btn btn-secondary" onclick="window.exportSettings()">Export Settings</button>
        <button type="button" class="btn btn-secondary" onclick="window.importSettings()">Import Settings</button>
        <button type="button" class="btn btn-danger" onclick="window.resetSettings()">Reset All</button>
        <input type="file" id="import-file" accept=".json" style="display: none;">
      </div>
      
      <div class="card">
        <button type="submit" class="btn btn-primary btn-large">Save Settings</button>
      </div>
    </form>
  `;
  
  document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);
};

function handleSaveSettings(e) {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  
  const settings = window.Storage.getSettings();
  settings.location.district = data.get('districtName');
  settings.location.lat = parseFloat(data.get('lat'));
  settings.location.lon = parseFloat(data.get('lon'));
  settings.schoolTimes.busTime = data.get('busTime');
  settings.schoolTimes.firstBell = data.get('firstBell');
  settings.districtSensitivity = data.get('sensitivity');
  settings.districtFactors.ruralBusRoutes = form.ruralRoutes.checked;
  settings.districtFactors.hillyRoads = form.hillyRoads.checked;
  settings.apiKeys.pirateWeather = data.get('pirateKey');
  settings.apiKeys.weatherApi = data.get('weatherApiKey');
  settings.feedUrls = data.get('feeds').split('\n').filter(u => u.trim());
  
  window.Storage.saveSettings(settings);
  window.UI.showToast('Settings saved successfully', 'success');
}

window.exportSettings = function() {
  const data = window.Storage.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gwc-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  window.UI.showToast('Settings exported', 'success');
};

window.importSettings = function() {
  const input = document.getElementById('import-file');
  input.onchange = function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        window.Storage.importAll(data);
        window.UI.showToast('Settings imported', 'success');
        window.initSettingsPage();
      } catch (err) {
        window.UI.showToast('Import failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

window.resetSettings = function() {
  if (confirm('Reset all settings and data? This cannot be undone.')) {
    window.Storage.resetAll();
    window.UI.showToast('All data reset', 'info');
    window.initSettingsPage();
  }
};
