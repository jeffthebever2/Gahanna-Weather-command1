// Diagnostics page - Self-test system
window.initDiagnosticsPage = function() {
  document.getElementById('run-all-tests').addEventListener('click', runAllTests);
  document.getElementById('clear-logs').addEventListener('click', clearLogs);
};

async function runAllTests() {
  const results = document.getElementById('test-results');
  const logs = document.getElementById('test-logs');
  results.innerHTML = '';
  logs.innerHTML = 'Starting diagnostics...\n';
  
  const tests = [
    { name: 'localStorage', fn: testLocalStorage },
    { name: 'Open-Meteo API', fn: () => testProvider('Open-Meteo') },
    { name: 'NWS API', fn: () => testProvider('NWS') },
    { name: 'Schema Validation', fn: testSchemaValidation },
    { name: 'Snow Day Algorithm', fn: testSnowDayAlgorithm },
    { name: 'Chart Rendering', fn: testChartRendering }
  ];
  
  for (const test of tests) {
    log(`\nTesting ${test.name}...`);
    try {
      const result = await test.fn();
      displayResult(test.name, result.pass, result.message);
      log(`✓ ${test.name}: ${result.message}`);
    } catch (err) {
      displayResult(test.name, false, err.message);
      log(`✗ ${test.name}: ${err.message}`);
    }
  }
  
  log('\n=== Diagnostics complete ===');
}

function testLocalStorage() {
  try {
    const key = 'gwc_test';
    localStorage.setItem(key, 'test');
    const val = localStorage.getItem(key);
    localStorage.removeItem(key);
    return { pass: val === 'test', message: 'Read/write OK' };
  } catch (err) {
    return { pass: false, message: err.message };
  }
}

async function testProvider(name) {
  try {
    const settings = window.Storage.getSettings();
    const { lat, lon } = settings.location;
    
    let data;
    if (name === 'Open-Meteo') {
      data = await window.WeatherAPI.fetchOpenMeteo(lat, lon);
    } else if (name === 'NWS') {
      data = await window.WeatherAPI.fetchNWS(lat, lon);
    }
    
    const hasData = data && data.current && data.hourly && data.daily;
    return { 
      pass: hasData, 
      message: hasData ? `Fetched successfully (${data.hourly.length} hours)` : 'No data returned' 
    };
  } catch (err) {
    if (err.message.includes('CORS') || err.message.includes('NetworkError')) {
      return { pass: false, message: 'Blocked by CORS or network' };
    }
    return { pass: false, message: err.message };
  }
}

function testSchemaValidation() {
  const testData = {
    temperature: 32,
    feelsLike: 28,
    humidity: 75,
    windSpeed: 10,
    condition: 'Snow'
  };
  
  const result = window.Schema.validate(testData, 'current');
  return { 
    pass: result.valid, 
    message: result.valid ? 'All schemas valid' : result.errors.join(', ') 
  };
}

function testSnowDayAlgorithm() {
  try {
    const mockWeather = {
      hourly: Array(48).fill(null).map((_, i) => ({
        time: new Date(Date.now() + i * 3600000),
        temperature: 30,
        precipitation: 0.1,
        snowfall: 0.5,
        windSpeed: 10,
        feelsLike: 25,
        humidity: 80,
        condition: 'Snow'
      })),
      failoverLevel: 0
    };
    
    const settings = window.Storage.getSettings();
    const prediction = window.SnowDayAlgorithm.calculate(mockWeather, settings);
    
    const valid = prediction.probability >= 0 && prediction.probability <= 100 &&
                  prediction.confidence >= 0 && prediction.confidence <= 100 &&
                  ['Normal', 'Delay possible', 'Closing likely'].includes(prediction.recommendation);
    
    return { 
      pass: valid, 
      message: valid ? `Output valid (prob: ${prediction.probability}%, conf: ${prediction.confidence}%)` : 'Invalid output' 
    };
  } catch (err) {
    return { pass: false, message: err.message };
  }
}

function testChartRendering() {
  try {
    if (typeof Chart === 'undefined') {
      return { pass: false, message: 'Chart.js not loaded' };
    }
    return { pass: true, message: 'Chart.js available' };
  } catch (err) {
    return { pass: false, message: err.message };
  }
}

function displayResult(name, pass, message) {
  const results = document.getElementById('test-results');
  const div = document.createElement('div');
  div.className = `test-result ${pass ? 'pass' : 'fail'}`;
  div.innerHTML = `
    <div class="test-name">${name}</div>
    <div class="test-status">${pass ? '✓ PASS' : '✗ FAIL'}: ${message}</div>
  `;
  results.appendChild(div);
}

function log(message) {
  const logs = document.getElementById('test-logs');
  logs.textContent += message + '\n';
  logs.scrollTop = logs.scrollHeight;
}

function clearLogs() {
  document.getElementById('test-logs').textContent = '';
  document.getElementById('test-results').innerHTML = '';
}
