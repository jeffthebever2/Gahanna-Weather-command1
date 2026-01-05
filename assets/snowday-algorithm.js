/**
 * snowday-algorithm.js
 * Explainable, weighted heuristic "School Impact" predictor.
 *
 * Outputs:
 * - probability 0-100
 * - confidence 0-100
 * - recommendation
 * - factor breakdown
 */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function parseHm(hm) {
  const [h, m] = String(hm || '00:00').split(':').map((x) => Number(x));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

export const WEIGHTS = {
  overnightSnow: 0.28,
  commuteSnow: 0.24,
  iceRisk: 0.22,
  wind: 0.12,
  temperatureProfile: 0.10,
  timingAlignment: 0.04
};

function scoreSnowInches(inches) {
  // Piecewise scoring: 0" -> 0, 1" -> 25, 2" -> 45, 4" -> 75, 6"+ -> 100
  const x = Math.max(0, inches);
  if (x === 0) return 0;
  if (x < 1) return 10 + x * 15;
  if (x < 2) return 25 + (x - 1) * 20;
  if (x < 4) return 45 + (x - 2) * 15;
  if (x < 6) return 75 + (x - 4) * 12.5;
  return 100;
}

function scoreIceRisk(hourlySlice) {
  // Ice risk when temps hover near freezing AND precip is present.
  let risk = 0;
  for (const h of hourlySlice) {
    const t = Number(h.temperature ?? NaN);
    const p = Number(h.precipitation ?? 0);
    if (!Number.isFinite(t)) continue;
    if (p <= 0) continue;

    if (t <= 20) {
      risk += 0.5;
    } else if (t < 28) {
      risk += 1.0;
    } else if (t >= 28 && t <= 33) {
      risk += 2.0;
    } else {
      risk += 0.25;
    }

    // Extra bump if precip type implies ice.
    const pt = String(h.precipType || '').toLowerCase();
    if (pt.includes('freezing') || pt.includes('sleet')) risk += 1.0;
  }

  // Normalize: 0–16 points roughly maps to 0–100.
  return clamp((risk / 16) * 100, 0, 100);
}

function scoreWind(hourlySlice) {
  // High wind makes blowing snow and bus travel worse.
  const maxWind = Math.max(...hourlySlice.map((h) => Number(h.windSpeed ?? 0)));
  if (maxWind < 10) return 5;
  if (maxWind < 20) return 25;
  if (maxWind < 30) return 60;
  if (maxWind < 40) return 85;
  return 100;
}

function scoreTemperatureProfile(hourlySlice) {
  // Colder temps help snow/ice persist.
  const temps = hourlySlice.map((h) => Number(h.temperature ?? NaN)).filter((t) => Number.isFinite(t));
  if (temps.length === 0) return 25;
  const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
  if (avg >= 38) return 5;
  if (avg >= 33) return 25;
  if (avg >= 28) return 50;
  if (avg >= 20) return 75;
  return 90;
}

function scoreTimingAlignment(hourly, windowStart, windowEnd) {
  // If a large fraction of snow falls inside the commute window, increase impact.
  const totalSnow = hourly.reduce((sum, h) => sum + Number(h.snowfall ?? 0), 0);
  if (totalSnow <= 0) return 0;

  const inWindowSnow = hourly
    .filter((h) => h.time >= windowStart && h.time <= windowEnd)
    .reduce((sum, h) => sum + Number(h.snowfall ?? 0), 0);

  const ratio = clamp(inWindowSnow / totalSnow, 0, 1);
  return Math.round(ratio * 100);
}

function computeCommuteWindow(baseDate, schoolTimes) {
  const bus = parseHm(schoolTimes?.busTime || '07:00');
  const bell = parseHm(schoolTimes?.firstBell || '08:00');

  const windowStart = new Date(baseDate);
  windowStart.setHours(bus.h, bus.m, 0, 0);

  const windowEnd = new Date(baseDate);
  windowEnd.setHours(bell.h, bell.m, 0, 0);

  return { windowStart, windowEnd };
}

function sliceBetween(hourly, start, end) {
  return hourly.filter((h) => h.time >= start && h.time <= end);
}

function sumSnow(hourlySlice) {
  return hourlySlice.reduce((sum, h) => sum + Number(h.snowfall ?? 0), 0);
}

function computeConfidence(weatherData) {
  let conf = 85;

  const failover = Number(weatherData?.failoverLevel ?? 0);
  conf -= failover * 6;

  const n = Array.isArray(weatherData?.hourly) ? weatherData.hourly.length : 0;
  if (n < 24) conf -= (24 - n) * 1.5;

  const missingSnow = (weatherData?.hourly || []).some((h) => h.snowfall === undefined);
  if (missingSnow) conf -= 6;

  conf = clamp(conf, 0, 100);
  return Math.round(conf);
}

function calculateHumanAdjustment(observations) {
  const o = observations || {};
  let adj = 0;
  if (o.roadsUntreated) adj += 4;
  if (o.iceReported) adj += 5;
  if (o.tempsFalling) adj += 3;
  if (o.plowsSeen) adj -= 3;
  if (o.roadsClear) adj -= 4;

  return clamp(adj, -10, 10);
}

function sensitivityNudge(sensitivity) {
  if (sensitivity === 'conservative') return 5;
  if (sensitivity === 'aggressive') return -5;
  return 0;
}

function recommendationFromProbability(prob, sensitivity) {
  // Thresholds adjust slightly with sensitivity.
  let delayT = 35;
  let closeT = 65;
  if (sensitivity === 'conservative') {
    delayT = 30;
    closeT = 60;
  }
  if (sensitivity === 'aggressive') {
    delayT = 40;
    closeT = 70;
  }

  if (prob >= closeT) return 'Closing likely';
  if (prob >= delayT) return 'Delay possible';
  return 'Normal';
}

function factor(name, score, weight, explanation, details = {}) {
  const contribution = score * weight;
  return {
    name,
    score: Math.round(score),
    weight,
    contribution: Math.round(contribution * 10) / 10,
    explanation,
    details
  };
}

function calculate(weatherData, settings) {
  const hourly = Array.isArray(weatherData?.hourly) ? weatherData.hourly : [];
  const s = settings || globalThis.window?.Storage?.getSettings?.() || {};
  const schoolTimes = s.schoolTimes || {};
  const sensitivity = s.districtSensitivity || 'normal';

  // Pick "tomorrow" relative to the first hourly point (fallback to now).
  const base = hourly[0]?.time instanceof Date ? startOfDay(hourly[0].time) : startOfDay(new Date());

  const { windowStart, windowEnd } = computeCommuteWindow(base, schoolTimes);

  const overnightStart = base;
  const overnightEnd = windowStart;

  const overnightSlice = sliceBetween(hourly, overnightStart, overnightEnd);
  const commuteSlice = sliceBetween(hourly, windowStart, windowEnd);

  const overnightSnow = sumSnow(overnightSlice);
  const commuteSnow = sumSnow(commuteSlice);

  const overnightScore = scoreSnowInches(overnightSnow);
  const commuteScore = scoreSnowInches(commuteSnow);
  const iceScore = scoreIceRisk(sliceBetween(hourly, overnightStart, windowEnd));
  const windScore = scoreWind(sliceBetween(hourly, overnightStart, windowEnd));
  const tempScore = scoreTemperatureProfile(sliceBetween(hourly, overnightStart, windowEnd));
  const timingScore = scoreTimingAlignment(hourly, windowStart, windowEnd);

  const factors = [
    factor(
      'Overnight Snow',
      overnightScore,
      WEIGHTS.overnightSnow,
      `Estimated overnight snowfall: ${overnightSnow.toFixed(1)}" (midnight → bus time).`,
      { overnightSnow }
    ),
    factor(
      'Morning Commute Snow',
      commuteScore,
      WEIGHTS.commuteSnow,
      `Estimated snowfall during the commute window: ${commuteSnow.toFixed(1)}".`,
      { commuteSnow }
    ),
    factor(
      'Ice Risk',
      iceScore,
      WEIGHTS.iceRisk,
      'Risk increases when temps hover near freezing and precipitation is present.',
      {}
    ),
    factor(
      'Wind / Blowing Snow',
      windScore,
      WEIGHTS.wind,
      'High wind can reduce visibility and create drifting/blowing snow.',
      {}
    ),
    factor(
      'Temperature Profile',
      tempScore,
      WEIGHTS.temperatureProfile,
      'Colder temps help snow/ice stick around; warmer temps reduce impacts.',
      {}
    ),
    factor(
      'Timing Alignment',
      timingScore,
      WEIGHTS.timingAlignment,
      'Snow falling during the commute window tends to matter more than snow outside it.',
      {}
    )
  ];

  const baseProb = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

  const observations = globalThis.window?.Storage?.getObservations ? globalThis.window.Storage.getObservations() : {};
  const humanAdj = calculateHumanAdjustment(observations);
  const sensAdj = sensitivityNudge(sensitivity);

  const probability = clamp(baseProb + humanAdj + sensAdj, 0, 100);
  const confidence = computeConfidence(weatherData);
  const recommendation = recommendationFromProbability(probability, sensitivity);

  return {
    probability: Math.round(probability),
    confidence,
    recommendation,
    factors,
    timestamp: new Date(),
    humanAdjustment: humanAdj,
    sensitivity
  };
}

export const SnowDayAlgorithm = {
  WEIGHTS,
  calculate,
  calculateHumanAdjustment
};

if (typeof window !== 'undefined') {
  window.SnowDayAlgorithm = SnowDayAlgorithm;
}
