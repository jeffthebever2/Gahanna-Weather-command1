/**
 * storage.js
 * LocalStorage wrapper + app state helpers.
 */

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export const Storage = {
  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return safeJsonParse(raw, defaultValue);
    } catch (err) {
      console.error('Storage get error:', err);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('Storage set error:', err);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (err) {
      console.error('Storage remove error:', err);
      return false;
    }
  },

  getSettings() {
    const defaults = {
      location: window.CONFIG.defaultLocation,
      units: 'F',
      timeFormat: '12h',
      theme: 'light',
      schoolTimes: {
        busTime: '07:00',
        firstBell: '08:00',
        commuteWindow: 120
      },
      districtSensitivity: 'normal',
      districtFactors: {
        ruralBusRoutes: false,
        hillyRoads: false
      },
      feedUrls: ['https://www.weather.gov/rss/'],
      scannerLinks: [{ name: 'Broadcastify', url: 'https://www.broadcastify.com' }],
      sourceLinks: [{ name: 'Gahanna Schools', url: 'https://www.gocruisers.org/' }],
      apiKeys: {
        pirateWeather: window.CONFIG.pirateWeatherKey || '',
        weatherApi: window.CONFIG.weatherApiKey || ''
      }
    };

    const merged = { ...defaults, ...this.get('gwc_settings', {}) };
    merged.schoolTimes = { ...defaults.schoolTimes, ...(merged.schoolTimes || {}) };
    merged.districtFactors = { ...defaults.districtFactors, ...(merged.districtFactors || {}) };
    merged.apiKeys = { ...defaults.apiKeys, ...(merged.apiKeys || {}) };
    return merged;
  },

  saveSettings(settings) {
    return this.set('gwc_settings', settings);
  },

  getCache(name) {
    const entry = this.get(`gwc_cache_${name}`);
    if (!entry) return null;
    const ageMs = Date.now() - entry.timestamp;
    const isStale = ageMs > 30 * 60 * 1000;
    return {
      data: entry.data,
      timestamp: entry.timestamp,
      isStale,
      age: Math.floor(ageMs / 60000)
    };
  },

  setCache(name, data) {
    return this.set(`gwc_cache_${name}`, { data, timestamp: Date.now() });
  },

  getHistory() {
    return this.get('gwc_history', []);
  },

  addHistory(entry) {
    const history = this.getHistory();
    const date = entry?.date || new Date().toISOString().split('T')[0];
    history.unshift({
      ...entry,
      date,
      timestamp: Date.now()
    });

    // Keep ~9 days and max 200 items.
    const nineDaysMs = 9 * 24 * 60 * 60 * 1000;
    const pruned = history
      .filter((h) => (h.timestamp ?? 0) > Date.now() - nineDaysMs)
      .slice(0, 200);

    return this.set('gwc_history', pruned);
  },

  updateHistoryOutcome(date, actualOutcome, notes = '') {
    const history = this.getHistory();
    const item = history.find((h) => h.date === date);
    if (!item) return false;
    item.actualOutcome = actualOutcome;
    item.outcomeNotes = notes;
    item.outcomeTimestamp = Date.now();
    return this.set('gwc_history', history);
  },

  getLastPrediction() {
    return this.getHistory()[0] || null;
  },

  getObservations() {
    return this.get('gwc_observations', {});
  },

  setObservations(obs) {
    return this.set('gwc_observations', obs);
  },

  getLastAlertIds() {
    return this.get('gwc_last_alerts', []);
  },

  setLastAlertIds(ids) {
    return this.set('gwc_last_alerts', ids);
  },

  getNotes() {
    return this.get('gwc_notes', '');
  },

  saveNotes(notes) {
    return this.set('gwc_notes', notes);
  },

  exportAll() {
    return {
      settings: this.getSettings(),
      history: this.getHistory(),
      notes: this.getNotes(),
      exportDate: new Date().toISOString()
    };
  },

  importAll(data) {
    if (data?.settings) this.saveSettings(data.settings);
    if (data?.history) this.set('gwc_history', data.history);
    if (data?.notes !== undefined) this.saveNotes(data.notes);
  },

  resetAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gwc_'))
      .forEach((k) => localStorage.removeItem(k));
  }
};

if (typeof window !== 'undefined') {
  window.Storage = Storage;
}
