import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('WeatherAPI', () => {
  beforeEach(() => {
    global.window = {
      Storage: {
        getSettings: () => ({
          apiKeys: { pirateWeather: '', weatherApi: '' }
        })
      }
    };
    global.fetchWithRetry = vi.fn();
  });
  
  describe('Provider Failover', () => {
    it('should try providers in order', async () => {
      const api = await import('../assets/api.js');
      
      // Mock first provider fails
      global.fetchWithRetry.mockRejectedValueOnce(new Error('Timeout'));
      // Second succeeds
      global.fetchWithRetry.mockResolvedValueOnce({
        json: () => Promise.resolve({ /* NWS data */ })
      });
      
      const result = await api.WeatherAPI.fetchWeather(40.0192, -82.8794);
      
      expect(global.fetchWithRetry).toHaveBeenCalledTimes(2);
      expect(result.failoverLevel).toBeGreaterThan(0);
    });
    
    it('should update provider health on failure', async () => {
      const api = await import('../assets/api.js');
      
      global.fetchWithRetry.mockRejectedValue(new Error('Provider down'));
      
      try {
        await api.WeatherAPI.fetchWeather(40.0192, -82.8794);
      } catch (err) {
        // Expected to fail
      }
      
      const health = api.WeatherAPI.getProviderHealth();
      expect(Object.values(health).some(h => h.status === 'Down')).toBe(true);
    });
  });
  
  describe('Data Normalization', () => {
    it('should normalize Open-Meteo data correctly', async () => {
      const api = await import('../assets/api.js');
      const mockData = {
        current: {
          time: '2026-01-05T14:00',
          temperature_2m: 32,
          relative_humidity_2m: 75,
          apparent_temperature: 28,
          wind_speed_10m: 10,
          weather_code: 71
        },
        hourly: {
          time: ['2026-01-05T15:00'],
          temperature_2m: [30],
          precipitation: [0.1],
          snowfall: [0.5],
          wind_speed_10m: [12]
        },
        daily: {
          time: ['2026-01-05'],
          temperature_2m_max: [35],
          temperature_2m_min: [25],
          precipitation_probability_max: [80]
        }
      };
      
      global.fetchWithRetry.mockResolvedValue({
        json: () => Promise.resolve(mockData)
      });
      
      const result = await api.WeatherAPI.fetchOpenMeteo(40.0192, -82.8794);
      
      expect(result.current).toHaveProperty('temperature', 32);
      expect(result.current).toHaveProperty('humidity', 75);
      expect(result.hourly).toHaveLength(1);
      expect(result.hourly[0]).toHaveProperty('snowfall', 0.5);
    });
    
    it('should handle missing optional fields', async () => {
      const api = await import('../assets/api.js');
      const mockData = {
        current: {
          time: '2026-01-05T14:00',
          temperature_2m: 32,
          relative_humidity_2m: 75,
          apparent_temperature: 28,
          wind_speed_10m: 10,
          weather_code: 71
          // Missing pressure, gusts, etc
        },
        hourly: { time: [], temperature_2m: [] },
        daily: { time: [], temperature_2m_max: [], temperature_2m_min: [] }
      };
      
      global.fetchWithRetry.mockResolvedValue({
        json: () => Promise.resolve(mockData)
      });
      
      const result = await api.WeatherAPI.fetchOpenMeteo(40.0192, -82.8794);
      
      expect(result.current.pressure).toBeDefined();
      expect(result.hourly).toBeDefined();
    });
  });
  
  describe('Timeout Handling', () => {
    it('should abort requests after timeout', async () => {
      global.fetchWithTimeout = async (url, options, timeout) => {
        return new Promise((resolve, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), timeout);
        });
      };
      
      const start = Date.now();
      try {
        await global.fetchWithTimeout('http://example.com', {}, 100);
      } catch (err) {
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(100);
        expect(elapsed).toBeLessThan(150);
        expect(err.message).toBe('Request timeout');
      }
    });
  });
});

describe('Provider Health Tracking', () => {
  it('should track last check time', async () => {
    const api = await import('../assets/api.js');
    
    api.WeatherAPI.updateProviderHealth('Test', 'OK');
    const health = api.WeatherAPI.getProviderHealth();
    
    expect(health.Test).toBeDefined();
    expect(health.Test.status).toBe('OK');
    expect(health.Test.lastCheck).toBeGreaterThan(0);
  });
  
  it('should store error messages', async () => {
    const api = await import('../assets/api.js');
    
    api.WeatherAPI.updateProviderHealth('Test', 'Down', 'Connection refused');
    const health = api.WeatherAPI.getProviderHealth();
    
    expect(health.Test.lastError).toBe('Connection refused');
  });
});
