import { describe, it, expect, beforeEach } from 'vitest';

describe('SnowDayAlgorithm', () => {
  let algorithm;
  let mockWeather;
  let mockSettings;
  
  beforeEach(() => {
    global.window = {
      Storage: {
        getObservations: () => ({}),
        getSettings: () => ({
          schoolTimes: {
            busTime: '07:00',
            firstBell: '08:00'
          },
          districtSensitivity: 'normal'
        })
      }
    };
    
    mockSettings = global.window.Storage.getSettings();
    
    // Create mock weather data for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    mockWeather = {
      hourly: Array(24).fill(null).map((_, i) => ({
        time: new Date(tomorrow.getTime() + i * 3600000),
        temperature: 30,
        precipitation: 0.1,
        snowfall: 0.5,
        windSpeed: 10,
        feelsLike: 25,
        humidity: 80,
        condition: 'Snow',
        precipType: 'snow'
      })),
      failoverLevel: 0
    };
  });
  
  describe('Probability Calculation', () => {
    it('should return value between 0 and 100', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      const result = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      expect(result.probability).toBeGreaterThanOrEqual(0);
      expect(result.probability).toBeLessThanOrEqual(100);
    });
    
    it('should increase probability with heavy snow', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      
      // Light snow
      mockWeather.hourly.forEach(h => h.snowfall = 0.2);
      const light = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      // Heavy snow
      mockWeather.hourly.forEach(h => h.snowfall = 2.0);
      const heavy = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      expect(heavy.probability).toBeGreaterThan(light.probability);
    });
    
    it('should increase probability with ice conditions', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      
      // No ice
      mockWeather.hourly.forEach(h => {
        h.temperature = 35;
        h.precipitation = 0;
      });
      const noIce = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      // Ice conditions
      mockWeather.hourly.forEach(h => {
        h.temperature = 31;
        h.precipitation = 0.2;
      });
      const ice = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      expect(ice.probability).toBeGreaterThan(noIce.probability);
    });
  });
  
  describe('Confidence Calculation', () => {
    it('should return value between 0 and 100', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      const result = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });
    
    it('should reduce confidence for backup providers', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      
      mockWeather.failoverLevel = 0;
      const primary = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      mockWeather.failoverLevel = 2;
      const backup = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      expect(backup.confidence).toBeLessThan(primary.confidence);
    });
    
    it('should reduce confidence for sparse data', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      
      const full = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      mockWeather.hourly = mockWeather.hourly.slice(0, 10);
      const sparse = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      expect(sparse.confidence).toBeLessThan(full.confidence);
    });
  });
  
  describe('Recommendation', () => {
    it('should recommend Normal for low probability', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      
      mockWeather.hourly.forEach(h => {
        h.temperature = 40;
        h.snowfall = 0;
        h.precipitation = 0;
      });
      
      const result = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      expect(result.recommendation).toBe('Normal');
    });
    
    it('should recommend Closing likely for high probability', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      
      mockWeather.hourly.forEach(h => {
        h.temperature = 20;
        h.snowfall = 3.0;
        h.windSpeed = 30;
      });
      
      const result = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      expect(result.recommendation).toBe('Closing likely');
    });
  });
  
  describe('Factor Breakdown', () => {
    it('should return all factors', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      const result = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      expect(result.factors).toBeDefined();
      expect(result.factors.length).toBeGreaterThan(0);
      
      const factorNames = result.factors.map(f => f.name);
      expect(factorNames).toContain('Overnight Snow');
      expect(factorNames).toContain('Morning Commute Snow');
      expect(factorNames).toContain('Ice Risk');
    });
    
    it('should include explanations for each factor', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      const result = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      result.factors.forEach(factor => {
        expect(factor).toHaveProperty('name');
        expect(factor).toHaveProperty('score');
        expect(factor).toHaveProperty('weight');
        expect(factor).toHaveProperty('explanation');
      });
    });
  });
  
  describe('Human Adjustments', () => {
    it('should apply local observations', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      
      global.window.Storage.getObservations = () => ({});
      const baseline = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      global.window.Storage.getObservations = () => ({
        roadsUntreated: true,
        iceReported: true
      });
      const adjusted = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      expect(adjusted.probability).toBeGreaterThan(baseline.probability);
    });
    
    it('should cap adjustments at ±10 points', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      
      const adjustment = algo.SnowDayAlgorithm.calculateHumanAdjustment({
        roadsUntreated: true,
        iceReported: true,
        tempsFalling: true
      });
      
      expect(Math.abs(adjustment)).toBeLessThanOrEqual(10);
    });
  });
  
  describe('District Sensitivity', () => {
    it('should increase probability for conservative', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      
      mockSettings.districtSensitivity = 'normal';
      const normal = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      mockSettings.districtSensitivity = 'conservative';
      const conservative = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      expect(conservative.probability).toBeGreaterThan(normal.probability);
    });
    
    it('should decrease probability for aggressive', async () => {
      const algo = await import('../assets/snowday-algorithm.js');
      
      mockSettings.districtSensitivity = 'normal';
      const normal = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      mockSettings.districtSensitivity = 'aggressive';
      const aggressive = algo.SnowDayAlgorithm.calculate(mockWeather, mockSettings);
      
      expect(aggressive.probability).toBeLessThan(normal.probability);
    });
  });
});
