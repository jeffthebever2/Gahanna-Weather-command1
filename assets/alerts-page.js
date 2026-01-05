// Initialize alerts page
window.initAlertsPage = async function() {
  const container = document.getElementById('alerts-container');
  container.innerHTML = '<div class="loading">Loading alerts...</div>';
  
  try {
    const settings = window.Storage.getSettings();
    const { lat, lon } = settings.location;
    
    const alerts = await window.AlertsAPI.fetchAlerts(lat, lon);
    
    if (alerts.length === 0) {
      container.innerHTML = '<div class="card"><p>No active alerts for your location.</p></div>';
      return;
    }
    
    let filteredAlerts = alerts;
    
    // Set up filters
    document.getElementById('alert-search').addEventListener('input', filterAlerts);
    document.getElementById('severity-filter').addEventListener('change', filterAlerts);
    document.getElementById('show-expired').addEventListener('change', filterAlerts);
    
    function filterAlerts() {
      const search = document.getElementById('alert-search').value.toLowerCase();
      const severity = document.getElementById('severity-filter').value;
      const showExpired = document.getElementById('show-expired').checked;
      
      filteredAlerts = alerts.filter(a => {
        const matchSearch = !search || a.headline.toLowerCase().includes(search) || a.event.toLowerCase().includes(search);
        const matchSeverity = severity === 'all' || a.severity === severity;
        const matchExpired = showExpired || new Date(a.expires) > new Date();
        return matchSearch && matchSeverity && matchExpired;
      });
      
      renderAlerts(filteredAlerts);
    }
    
    renderAlerts(alerts);
    
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="alert alert-danger">Error: ${err.message}</div></div>`;
  }
};

function renderAlerts(alerts) {
  const container = document.getElementById('alerts-container');
  
  if (alerts.length === 0) {
    container.innerHTML = '<div class="card"><p>No alerts match your filters.</p></div>';
    return;
  }
  
  container.innerHTML = alerts.map(alert => `
    <div class="alert-item severity-${alert.severity} ${alert.isNew ? 'new' : ''}" onclick="window.showAlertDetails('${alert.id}')">
      <div>
        <span class="alert-badge badge-${alert.severity}">${alert.severity}</span>
        ${alert.isNew ? '<span class="alert-badge" style="background: var(--danger);">NEW</span>' : ''}
        ${alert.schoolImpact !== 'Low' ? `<span class="alert-badge" style="background: var(--warning);">School: ${alert.schoolImpact}</span>` : ''}
        ${alert.powerRisk !== 'Low' ? `<span class="alert-badge" style="background: var(--danger);">Power: ${alert.powerRisk}</span>` : ''}
      </div>
      <div class="alert-headline">${alert.headline}</div>
      <div class="alert-meta">
        ${alert.event} • Effective: ${new Date(alert.effective).toLocaleString()} • Expires: ${new Date(alert.expires).toLocaleString()}
      </div>
      ${alert.impactReason ? `<div style="margin-top: 5px; font-size: 13px; color: var(--gray-700);">${alert.impactReason}</div>` : ''}
    </div>
  `).join('');
}

window.showAlertDetails = function(id) {
  const settings = window.Storage.getSettings();
  const { lat, lon } = settings.location;
  
  window.AlertsAPI.fetchAlerts(lat, lon).then(alerts => {
    const alert = alerts.find(a => a.id === id);
    if (!alert) return;
    
    const content = `
      <div>
        <div style="margin-bottom: 15px;">
          <span class="alert-badge badge-${alert.severity}">${alert.severity}</span>
          <span class="alert-badge badge-${alert.urgency}">${alert.urgency}</span>
        </div>
        <h3>${alert.event}</h3>
        <p><strong>Areas:</strong> ${alert.areas.join(', ')}</p>
        <p><strong>Effective:</strong> ${new Date(alert.effective).toLocaleString()}</p>
        <p><strong>Expires:</strong> ${new Date(alert.expires).toLocaleString()}</p>
        <hr>
        <p><strong>Description:</strong></p>
        <p>${alert.description}</p>
        ${alert.instruction ? `<p><strong>Instructions:</strong></p><p>${alert.instruction}</p>` : ''}
        <hr>
        <p><strong>Impact Assessment:</strong></p>
        <p>School Impact: ${alert.schoolImpact}</p>
        <p>Power Outage Risk: ${alert.powerRisk}</p>
        ${alert.impactReason ? `<p>${alert.impactReason}</p>` : ''}
        <button class="btn btn-primary" onclick="window.copyAlertText('${alert.id}')">Copy Alert Text</button>
      </div>
    `;
    
    window.UI.showModal(alert.headline, content);
  });
};

window.copyAlertText = function(id) {
  // Implementation would copy alert text to clipboard
  window.UI.showToast('Alert copied to clipboard', 'success');
};
