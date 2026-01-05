/**
 * snowday-ui.js
 * Renders Snow Day / School Impact prediction page.
 */

function barRow(name, score, weight, explanation) {
  const pct = Math.round(score);
  const contrib = Math.round(score * weight);
  return `
    <div class="factor-row">
      <div class="factor-head">
        <div class="factor-name">${name}</div>
        <div class="factor-meta">Score ${pct} • Weight ${Math.round(weight * 100)}% • Contrib ${contrib}</div>
      </div>
      <div class="factor-bar">
        <div class="factor-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="factor-expl">${explanation}</div>
    </div>
  `;
}

export function renderSnowday(container, prediction, weatherData, settings) {
  const s = settings || window.Storage.getSettings();
  const loc = s.location?.name || 'Location';
  const bus = s.schoolTimes?.busTime || '07:00';
  const bell = s.schoolTimes?.firstBell || '08:00';

  container.innerHTML = `
    <h1>Snow Day / School Impact</h1>
    <p class="card-label">${loc} • Bus ${bus} • First bell ${bell}</p>

    <div class="cards-grid">
      <div class="card">
        <div class="card-header">Probability</div>
        <div class="card-value">${prediction.probability}%</div>
        <div class="card-label">${prediction.recommendation}</div>
      </div>
      <div class="card">
        <div class="card-header">Confidence</div>
        <div class="card-value">${prediction.confidence}%</div>
        <div class="card-label">Failover level: ${weatherData?.failoverLevel ?? 0}</div>
      </div>
      <div class="card">
        <div class="card-header">Human Adjustment</div>
        <div class="card-value">${prediction.humanAdjustment >= 0 ? '+' : ''}${prediction.humanAdjustment}</div>
        <div class="card-label">Bounded to ±10</div>
      </div>
    </div>

    <h2>Why</h2>
    <div class="card">
      ${prediction.factors.map((f) => barRow(f.name, f.score, f.weight, f.explanation)).join('')}
    </div>

    <h2>Why Not</h2>
    <div class="card">
      <p>If the probability is low, it usually means one or more of these are true:</p>
      <ul>
        <li>Snow is light or falls mostly outside the commute window.</li>
        <li>Temps are warm enough for melting/treated roads.</li>
        <li>Precipitation is uncertain or not wintry.</li>
      </ul>
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window.renderSnowday = renderSnowday;
}
