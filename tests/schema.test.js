import { describe, it, expect } from 'vitest';

describe('Schema Validation', () => {
  let Schema;
  
  beforeEach(async () => {
    global.window = {};
    const module = await import('../assets/schema.js');
    Schema = window.Schema;
  });
  
  describe('Current Conditions', () => {
    it('should validate complete current data', () => {
      const data = {
        temperature: 32,
        feelsLike: 28,
        humidity: 75,
        windSpeed: 10,
        condition: 'Snow'
      };
      
      const result = Schema.validate(data, 'current');
      expect(result.valid).toBe(true);
    });
    
    it('should reject missing required fields', () => {
      const data = {
        temperature: 32
        // Missing feelsLike, humidity, windSpeed, condition
      };
      
      const result = Schema.validate(data, 'current');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
  
  describe('Hourly Data', () => {
    it('should validate complete hourly data', () => {
      const data = {
        time: new Date(),
        temperature: 30,
        precipitation: 0.1,
        windSpeed: 12
      };
      
      const result = Schema.validate(data, 'hourly');
      expect(result.valid).toBe(true);
    });
  });
  
  describe('Snow Day Output', () => {
    it('should validate snow day prediction', () => {
      const data = {
        probability: 75,
        confidence: 85,
        recommendation: 'Closing likely',
        factors: []
      };
      
      const result = Schema.validate(data, 'snowday');
      expect(result.valid).toBe(true);
    });
    
    it('should reject out-of-range probability', () => {
      const data = {
        probability: 150,
        confidence: 85,
        recommendation: 'Closing likely',
        factors: []
      };
      
      const result = Schema.validate(data, 'snowday');
      expect(result.valid).toBe(false);
    });
    
    it('should reject out-of-range confidence', () => {
      const data = {
        probability: 75,
        confidence: -10,
        recommendation: 'Closing likely',
        factors: []
      };
      
      const result = Schema.validate(data, 'snowday');
      expect(result.valid).toBe(false);
    });
  });
  
  describe('Alert Data', () => {
    it('should validate complete alert', () => {
      const data = {
        id: 'alert-123',
        event: 'Winter Storm Warning',
        severity: 'Severe',
        headline: 'Winter Storm Warning in effect',
        effective: new Date(),
        expires: new Date()
      };
      
      const result = Schema.validate(data, 'alert');
      expect(result.valid).toBe(true);
    });
  });
  
  describe('hasRequiredFields', () => {
    it('should return true when all required present', () => {
      const data = {
        temperature: 32,
        feelsLike: 28,
        humidity: 75,
        windSpeed: 10,
        condition: 'Snow'
      };
      
      expect(Schema.hasRequiredFields(data, 'current')).toBe(true);
    });
    
    it('should return false when required missing', () => {
      const data = {
        temperature: 32
      };
      
      expect(Schema.hasRequiredFields(data, 'current')).toBe(false);
    });
  });
});
