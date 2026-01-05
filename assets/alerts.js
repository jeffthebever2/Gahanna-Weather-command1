/**
 * alerts.js
 * Fetches NWS active alerts and normalizes them for the UI.
 */

import { Schema } from './schema.js';

function safeSplitAreas(areaDesc) {
  if (!areaDesc) return [];
  return String(areaDesc)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function textContainsWinterRisk(text) {
  const t = (text || '').toLowerCase();
  return t.includes('snow') || t.includes('ice') || t.includes('sleet') || t.includes('freezing');
}

function calculateImpact(props) {
  const event = String(props?.event || '');
  const desc = String(props?.description || '');
  const combined = `${event} ${desc}`.toLowerCase();

  let schoolImpact = 'Low';
  let powerRisk = 'Low';
  let impactReason = 'Non-winter event.';

  if (combined.includes('ice storm')) {
    schoolImpact = 'High';
    powerRisk = 'High';
    impactReason = 'Ice accumulation can make roads hazardous and can damage power lines.';
  } else if (combined.includes('winter storm warning') || (combined.includes('blizzard') && combined.includes('warning'))) {
    schoolImpact = 'High';
    powerRisk = combined.includes('wind') ? 'Med' : 'Low';
    impactReason = 'Heavy snow and/or strong winds can severely impact travel and buses.';
  } else if (combined.includes('winter weather advisory')) {
    schoolImpact = 'Med';
    powerRisk = 'Low';
    impactReason = 'Winter weather may impact travel, but typically less severe than a warning.';
  } else if (textContainsWinterRisk(combined)) {
    schoolImpact = 'Med';
    powerRisk = combined.includes('wind') ? 'Med' : 'Low';
    impactReason = 'Winter conditions mentioned; monitor for road impacts.';
  }

  return { schoolImpact, powerRisk, impactReason };
}

function normalizeAlert(feature) {
  const p = feature?.properties || {};
  const impact = calculateImpact(p);

  const alert = {
    id: String(p.id || p['@id'] || ''),
    event: String(p.event || 'Unknown'),
    severity: String(p.severity || 'Unknown'),
    urgency: p.urgency ? String(p.urgency) : undefined,
    certainty: p.certainty ? String(p.certainty) : undefined,
    headline: String(p.headline || p.event || 'Alert'),
    description: String(p.description || ''),
    instruction: p.instruction ? String(p.instruction) : '',
    effective: new Date(p.effective || p.sent || Date.now()),
    expires: new Date(p.expires || Date.now()),
    areas: safeSplitAreas(p.areaDesc),
    sender: p.senderName ? String(p.senderName) : '',
    ...impact
  };

  // Schema validation is advisory only.
  Schema.validate(alert, 'alert');
  return alert;
}

async function fetchAlerts(lat, lon) {
  try {
    const url = `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
    const res = await globalThis.fetchWithRetry(url, {
      headers: { 'User-Agent': 'GahannaWeatherCommand/1.0 (github pages)' }
    });

    const json = await res.json();
    const features = json?.features || [];

    const lastIds = globalThis.window?.Storage?.getLastAlertIds ? globalThis.window.Storage.getLastAlertIds() : [];
    const seen = new Set(lastIds);

    const alerts = features.map((f) => {
      const a = normalizeAlert(f);
      a.isNew = !seen.has(a.id);
      return a;
    });

    // Persist current IDs for "new" detection.
    if (globalThis.window?.Storage?.setLastAlertIds) {
      globalThis.window.Storage.setLastAlertIds(alerts.map((a) => a.id));
    }

    // Sort: most severe first, then newest.
    const sevRank = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };
    alerts.sort((a, b) => {
      const ra = sevRank[a.severity] ?? 0;
      const rb = sevRank[b.severity] ?? 0;
      if (rb !== ra) return rb - ra;
      return b.effective.getTime() - a.effective.getTime();
    });

    return alerts;
  } catch (err) {
    console.error('Alerts fetch failed:', err);
    return [];
  }
}

export const AlertsAPI = {
  fetchAlerts,
  normalizeAlert,
  calculateImpact
};

if (typeof window !== 'undefined') {
  window.AlertsAPI = AlertsAPI;
}
