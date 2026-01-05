import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AlertsAPI', () => {
  let AlertsAPI;
  
  beforeEach(async () => {
    global.window = {
      Storage: {
        getLastAlertIds: () => [],
        setLastAlertIds: vi.fn()
      }
    };
    global.fetchWithRetry = vi.fn();
    
    const module = await import('../assets/alerts.js');
    AlertsAPI = window.AlertsAPI;
  });
  
  describe('Fetch Alerts', () => {
    it('should fetch and normalize NWS alerts', async () => {
      const mockResponse = {
        features: [
          {
            properties: {
              id: 'alert-1',
              event: 'Winter Storm Warning',
              severity: 'Severe',
              urgency: 'Expected',
              certainty: 'Likely',
              headline: 'Winter Storm Warning in effect',
              description: 'Heavy snow expected',
              instruction: 'Avoid travel',
              effective: '2026-01-05T12:00:00-05:00',
              expires: '2026-01-06T12:00:00-05:00',
              areaDesc: 'Franklin County'
            }
          }
        ]
      };
      
      global.fetchWithRetry.mockResolvedValue({
        json: () => Promise.resolve(mockResponse)
      });
      
      const alerts = await AlertsAPI.fetchAlerts(40.0192, -82.8794);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toHaveProperty('id', 'alert-1');
      expect(alerts[0]).toHaveProperty('event', 'Winter Storm Warning');
      expect(alerts[0]).toHaveProperty('severity', 'Severe');
    });
    
    it('should handle fetch errors gracefully', async () => {
      global.fetchWithRetry.mockRejectedValue(new Error('Network error'));
      
      const alerts = await AlertsAPI.fetchAlerts(40.0192, -82.8794);
      
      expect(alerts).toEqual([]);
    });
  });
  
  describe('Alert Normalization', () => {
    it('should normalize alert structure', () => {
      const feature = {
        properties: {
          id: 'test-id',
          event: 'Test Event',
          severity: 'Moderate',
          urgency: 'Expected',
          certainty: 'Likely',
          headline: 'Test Headline',
          description: 'Test Description',
          instruction: 'Test Instruction',
          effective: '2026-01-05T12:00:00-05:00',
          expires: '2026-01-06T12:00:00-05:00',
          areaDesc: 'Area 1; Area 2'
        }
      };
      
      const normalized = AlertsAPI.normalizeAlert(feature);
      
      expect(normalized.id).toBe('test-id');
      expect(normalized.areas).toEqual(['Area 1', 'Area 2']);
      expect(normalized.effective).toBeInstanceOf(Date);
    });
  });
  
  describe('Impact Calculation', () => {
    it('should calculate high school impact for winter storm', () => {
      const props = {
        event: 'Winter Storm Warning',
        description: 'Heavy snow expected'
      };
      
      const impact = AlertsAPI.calculateImpact(props);
      
      expect(impact.schoolImpact).toBe('High');
      expect(impact.impactReason).toContain('Heavy snow');
    });
    
    it('should calculate high school impact for ice storm', () => {
      const props = {
        event: 'Ice Storm Warning',
        description: 'Ice accumulation expected'
      };
      
      const impact = AlertsAPI.calculateImpact(props);
      
      expect(impact.schoolImpact).toBe('High');
      expect(impact.powerRisk).toBe('High');
    });
    
    it('should calculate medium school impact for winter weather advisory', () => {
      const props = {
        event: 'Winter Weather Advisory',
        description: 'Light snow expected'
      };
      
      const impact = AlertsAPI.calculateImpact(props);
      
      expect(impact.schoolImpact).toBe('Med');
    });
    
    it('should calculate low impact for non-winter events', () => {
      const props = {
        event: 'Heat Advisory',
        description: 'Hot temperatures expected'
      };
      
      const impact = AlertsAPI.calculateImpact(props);
      
      expect(impact.schoolImpact).toBe('Low');
      expect(impact.powerRisk).toBe('Low');
    });
  });
  
  describe('New Alert Detection', () => {
    it('should mark alerts as new', async () => {
      const mockResponse = {
        features: [
          {
            properties: {
              id: 'new-alert',
              event: 'Test',
              severity: 'Moderate',
              headline: 'Test',
              description: 'Test',
              effective: '2026-01-05T12:00:00-05:00',
              expires: '2026-01-06T12:00:00-05:00'
            }
          }
        ]
      };
      
      global.fetchWithRetry.mockResolvedValue({
        json: () => Promise.resolve(mockResponse)
      });
      
      global.window.Storage.getLastAlertIds = () => [];
      
      const alerts = await AlertsAPI.fetchAlerts(40.0192, -82.8794);
      
      expect(alerts[0].isNew).toBe(true);
    });
    
    it('should not mark previously seen alerts as new', async () => {
      const mockResponse = {
        features: [
          {
            properties: {
              id: 'existing-alert',
              event: 'Test',
              severity: 'Moderate',
              headline: 'Test',
              description: 'Test',
              effective: '2026-01-05T12:00:00-05:00',
              expires: '2026-01-06T12:00:00-05:00'
            }
          }
        ]
      };
      
      global.fetchWithRetry.mockResolvedValue({
        json: () => Promise.resolve(mockResponse)
      });
      
      global.window.Storage.getLastAlertIds = () => ['existing-alert'];
      
      const alerts = await AlertsAPI.fetchAlerts(40.0192, -82.8794);
      
      expect(alerts[0].isNew).toBe(false);
    });
  });
});
