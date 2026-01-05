// History page - Prediction vs Reality
window.initHistoryPage = function() {
  const container = document.getElementById('history-container');
  const history = window.Storage.getHistory();
  
  if (history.length === 0) {
    container.innerHTML = `
      <div class="card">
        <p>No prediction history yet. Predictions are automatically logged when you view the Snow Day page.</p>
      </div>
    `;
    return;
  }
  
  const stats = calculateStats(history);
  
  container.innerHTML = `
    <div class="cards-grid">
      <div class="card">
        <div class="card-header">Total Predictions</div>
        <div class="card-value">${history.length}</div>
      </div>
      <div class="card">
        <div class="card-header">Logged Outcomes</div>
        <div class="card-value">${stats.logged}</div>
      </div>
      <div class="card">
        <div class="card-header">Accuracy (Last 10)</div>
        <div class="card-value">${stats.accuracy}%</div>
      </div>
    </div>
    
    <div class="card">
      <h2>Prediction History</h2>
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Probability</th>
            <th>Confidence</th>
            <th>Recommendation</th>
            <th>Actual Outcome</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${history.map(h => `
            <tr>
              <td>${h.date}</td>
              <td>${h.probability}%</td>
              <td>${h.confidence}%</td>
              <td>${h.recommendation}</td>
              <td>
                ${h.actualOutcome ? 
                  `<strong>${h.actualOutcome}</strong>` : 
                  `<select onchange="window.logOutcome('${h.date}', this.value)" class="form-select">
                    <option value="">Log outcome...</option>
                    <option value="Closed">Closed</option>
                    <option value="Delayed">Delayed</option>
                    <option value="Normal">Normal</option>
                  </select>`
                }
              </td>
              <td>
                ${h.actualOutcome ? 
                  `<button onclick="window.clearOutcome('${h.date}')" class="btn btn-small btn-secondary">Clear</button>` : 
                  ''
                }
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    ${stats.logged >= 5 ? `
      <div class="card">
        <h2>Calibration Analysis</h2>
        <p>Predicted probability vs actual closure rate:</p>
        <div>${renderCalibration(history)}</div>
      </div>
    ` : ''}
  `;
};

function calculateStats(history) {
  const logged = history.filter(h => h.actualOutcome).length;
  const last10 = history.slice(0, 10).filter(h => h.actualOutcome);
  
  let correct = 0;
  last10.forEach(h => {
    const predicted = h.probability >= 50 ? 'Closed/Delayed' : 'Normal';
    const actual = h.actualOutcome === 'Normal' ? 'Normal' : 'Closed/Delayed';
    if (predicted === actual) correct++;
  });
  
  const accuracy = last10.length > 0 ? Math.round((correct / last10.length) * 100) : 0;
  
  return { logged, accuracy };
}

function renderCalibration(history) {
  const logged = history.filter(h => h.actualOutcome);
  const buckets = { '0-20': [], '20-40': [], '40-60': [], '60-80': [], '80-100': [] };
  
  logged.forEach(h => {
    const p = h.probability;
    if (p < 20) buckets['0-20'].push(h);
    else if (p < 40) buckets['20-40'].push(h);
    else if (p < 60) buckets['40-60'].push(h);
    else if (p < 80) buckets['60-80'].push(h);
    else buckets['80-100'].push(h);
  });
  
  return Object.entries(buckets).map(([range, items]) => {
    if (items.length === 0) return '';
    const closed = items.filter(h => h.actualOutcome !== 'Normal').length;
    const rate = Math.round((closed / items.length) * 100);
    return `
      <div style="margin: 10px 0;">
        <strong>${range}% predicted:</strong> ${rate}% actual closure rate (${closed}/${items.length} closed)
      </div>
    `;
  }).join('');
}

window.logOutcome = function(date, outcome) {
  if (!outcome) return;
  window.Storage.updateHistoryOutcome(date, outcome);
  window.UI.showToast(`Outcome logged: ${outcome}`, 'success');
  window.initHistoryPage();
};

window.clearOutcome = function(date) {
  window.Storage.updateHistoryOutcome(date, null);
  window.UI.showToast('Outcome cleared', 'info');
  window.initHistoryPage();
};
