import { describe, it, expect, beforeEach } from 'vitest';

describe('Storage', () => {
  let Storage;
  
  beforeEach(async () => {
    // Mock localStorage
    const store = {};
    global.localStorage = {
      getItem: (key) => store[key] || null,
      setItem: (key, value) => { store[key] = value; },
      removeItem: (key) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); }
    };
    
    global.window = { CONFIG: { defaultLocation: { name: 'Test', lat: 40, lon: -82 } } };
    const module = await import('../assets/storage.js');
    Storage = window.Storage;
  });
  
  describe('Basic Operations', () => {
    it('should get and set values', () => {
      Storage.set('test', { foo: 'bar' });
      const result = Storage.get('test');
      expect(result).toEqual({ foo: 'bar' });
    });
    
    it('should return default value when key missing', () => {
      const result = Storage.get('missing', 'default');
      expect(result).toBe('default');
    });
    
    it('should remove values', () => {
      Storage.set('test', 'value');
      Storage.remove('test');
      const result = Storage.get('test');
      expect(result).toBeNull();
    });
  });
  
  describe('Settings', () => {
    it('should get default settings', () => {
      const settings = Storage.getSettings();
      expect(settings).toHaveProperty('location');
      expect(settings).toHaveProperty('schoolTimes');
      expect(settings).toHaveProperty('districtSensitivity');
    });
    
    it('should save and retrieve settings', () => {
      const newSettings = Storage.getSettings();
      newSettings.location.name = 'Updated';
      Storage.saveSettings(newSettings);
      
      const retrieved = Storage.getSettings();
      expect(retrieved.location.name).toBe('Updated');
    });
  });
  
  describe('Cache', () => {
    it('should cache and retrieve data', () => {
      const data = { temperature: 32 };
      Storage.setCache('test', data);
      
      const cached = Storage.getCache('test');
      expect(cached.data).toEqual(data);
      expect(cached.timestamp).toBeDefined();
    });
    
    it('should mark old cache as stale', () => {
      const data = { temperature: 32 };
      Storage.setCache('test', data);
      
      // Mock old timestamp
      const key = 'gwc_cache_test';
      const cached = JSON.parse(localStorage.getItem(key));
      cached.timestamp = Date.now() - 31 * 60 * 1000; // 31 minutes ago
      localStorage.setItem(key, JSON.stringify(cached));
      
      const result = Storage.getCache('test');
      expect(result.isStale).toBe(true);
    });
  });
  
  describe('History', () => {
    it('should add history entries', () => {
      const prediction = {
        probability: 75,
        confidence: 85,
        recommendation: 'Closing likely'
      };
      
      Storage.addHistory(prediction);
      const history = Storage.getHistory();
      
      expect(history.length).toBe(1);
      expect(history[0].probability).toBe(75);
    });
    
    it('should update outcome', () => {
      const prediction = {
        probability: 75,
        confidence: 85,
        date: '2026-01-06'
      };
      
      Storage.addHistory(prediction);
      Storage.updateHistoryOutcome('2026-01-06', 'Closed');
      
      const history = Storage.getHistory();
      expect(history[0].actualOutcome).toBe('Closed');
    });
    
    it('should limit history to 200 entries', () => {
      for (let i = 0; i < 250; i++) {
        Storage.addHistory({ probability: i });
      }
      
      const history = Storage.getHistory();
      expect(history.length).toBeLessThanOrEqual(200);
    });
  });
  
  describe('Export/Import', () => {
    it('should export all data', () => {
      Storage.set('gwc_notes', 'Test notes');
      const exported = Storage.exportAll();
      
      expect(exported).toHaveProperty('settings');
      expect(exported).toHaveProperty('history');
      expect(exported).toHaveProperty('notes');
      expect(exported).toHaveProperty('exportDate');
    });
    
    it('should import data', () => {
      const data = {
        settings: { location: { name: 'Imported' } },
        history: [{ probability: 50 }],
        notes: 'Imported notes'
      };
      
      Storage.importAll(data);
      
      const settings = Storage.getSettings();
      expect(settings.location.name).toBe('Imported');
      
      const notes = Storage.getNotes();
      expect(notes).toBe('Imported notes');
    });
  });
});
