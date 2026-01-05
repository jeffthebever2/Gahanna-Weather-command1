/**
 * schema.js
 *
 * Small, dependency-free schema validator.
 * - Used in runtime (Diagnostics page) to sanity-check normalized data.
 * - Used in unit tests.
 *
 * Design goal: strict enough to catch broken normalization, but tolerant of
 * optional/missing fields across providers.
 */

const TYPE = {
  NUMBER: 'number',
  STRING: 'string',
  DATE: 'date',
  ARRAY: 'array',
  OBJECT: 'object'
};

export const SCHEMAS = {
  current: {
    temperature: { type: TYPE.NUMBER, required: true },
    feelsLike: { type: TYPE.NUMBER, required: true },
    humidity: { type: TYPE.NUMBER, required: true, min: 0, max: 100 },
    windSpeed: { type: TYPE.NUMBER, required: true, min: 0 },
    condition: { type: TYPE.STRING, required: true }
  },

  hourly: {
    time: { type: TYPE.DATE, required: true },
    temperature: { type: TYPE.NUMBER, required: true },
    precipitation: { type: TYPE.NUMBER, required: true, min: 0 },
    windSpeed: { type: TYPE.NUMBER, required: true, min: 0 },
    snowfall: { type: TYPE.NUMBER, required: false, min: 0 }
  },

  daily: {
    date: { type: TYPE.DATE, required: true },
    tempHigh: { type: TYPE.NUMBER, required: true },
    tempLow: { type: TYPE.NUMBER, required: true },
    precipChance: { type: TYPE.NUMBER, required: true, min: 0, max: 100 },
    condition: { type: TYPE.STRING, required: true }
  },

  alert: {
    id: { type: TYPE.STRING, required: true },
    event: { type: TYPE.STRING, required: true },
    severity: { type: TYPE.STRING, required: true },
    headline: { type: TYPE.STRING, required: true },
    effective: { type: TYPE.DATE, required: true },
    expires: { type: TYPE.DATE, required: true }
  },

  snowday: {
    probability: { type: TYPE.NUMBER, required: true, min: 0, max: 100 },
    confidence: { type: TYPE.NUMBER, required: true, min: 0, max: 100 },
    recommendation: {
      type: TYPE.STRING,
      required: true,
      enum: ['Normal', 'Delay possible', 'Closing likely']
    },
    factors: { type: TYPE.ARRAY, required: true }
  }
};

function isDateLike(v) {
  return v instanceof Date || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
}

function normalizeDate(v) {
  if (v instanceof Date) return v;
  return new Date(v);
}

function validateField(value, rule, fieldName) {
  const errors = [];

  if (rule.required && (value === undefined || value === null)) {
    errors.push(`${fieldName} is required`);
    return errors;
  }

  if (value === undefined || value === null) return errors;

  switch (rule.type) {
    case TYPE.NUMBER:
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push(`${fieldName} must be a number`);
      }
      break;
    case TYPE.STRING:
      if (typeof value !== 'string') {
        errors.push(`${fieldName} must be a string`);
      }
      break;
    case TYPE.DATE:
      if (!isDateLike(value)) {
        errors.push(`${fieldName} must be a date`);
      }
      break;
    case TYPE.ARRAY:
      if (!Array.isArray(value)) {
        errors.push(`${fieldName} must be an array`);
      }
      break;
    case TYPE.OBJECT:
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${fieldName} must be an object`);
      }
      break;
    default:
      break;
  }

  if (typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) errors.push(`${fieldName} must be >= ${rule.min}`);
    if (rule.max !== undefined && value > rule.max) errors.push(`${fieldName} must be <= ${rule.max}`);
  }

  if (rule.enum && typeof value === 'string' && !rule.enum.includes(value)) {
    errors.push(`${fieldName} must be one of: ${rule.enum.join(', ')}`);
  }

  return errors;
}

export const Schema = {
  /**
   * Validate a data object against a named schema.
   * @param {any} data
   * @param {'current'|'hourly'|'daily'|'alert'|'snowday'} schemaName
   */
  validate(data, schemaName) {
    const schema = SCHEMAS[schemaName];
    if (!schema) {
      return { valid: false, errors: [`Unknown schema: ${schemaName}`] };
    }

    if (data === null || data === undefined || typeof data !== 'object') {
      return { valid: false, errors: ['Data must be an object'] };
    }

    const errors = [];
    for (const [field, rule] of Object.entries(schema)) {
      errors.push(...validateField(data[field], rule, field));
    }

    // Normalize date strings in-place for convenience (runtime only).
    for (const [field, rule] of Object.entries(schema)) {
      if (rule.type === TYPE.DATE && data[field] && !(data[field] instanceof Date) && isDateLike(data[field])) {
        data[field] = normalizeDate(data[field]);
      }
    }

    return { valid: errors.length === 0, errors };
  },

  hasRequiredFields(data, schemaName) {
    const schema = SCHEMAS[schemaName];
    if (!schema || data === null || data === undefined) return false;
    for (const [field, rule] of Object.entries(schema)) {
      if (rule.required && (data[field] === undefined || data[field] === null)) return false;
    }
    return true;
  }
};

// Browser global (for non-module consumers and page scripts)
if (typeof window !== 'undefined') {
  window.Schema = Schema;
  window.SCHEMAS = SCHEMAS;
}
