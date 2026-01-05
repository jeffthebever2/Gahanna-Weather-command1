#!/usr/bin/env node

/**
 * Smoke Test Script
 * Verifies repository structure and file integrity
 */

import { readdir, readFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

let errors = 0;
let warnings = 0;

function log(message, type = 'info') {
  const symbols = { info: '  ℹ️', success: '✅', error: '❌', warning: '⚠️ ' };
  console.log(`${symbols[type] || '  '} ${message}`);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function checkRequiredFiles() {
  log('Checking required files...', 'info');

  const required = [
    'index.html',
    'forecast.html',
    'alerts.html',
    'snowday.html',
    'maps.html',
    'feeds.html',
    'history.html',
    'settings.html',
    'developer.html',
    'about.html',
    'diagnostics.html',
    'assets/styles.css',
    'assets/config.js',
    'assets/schema.js',
    'assets/storage.js',
    'assets/api.js',
    'assets/alerts.js',
    'assets/snowday-algorithm.js',
    'assets/ui.js',
    'README.md',
    'LICENSE'
  ];

  for (const file of required) {
    const path = join(ROOT, file);
    const exists = await fileExists(path);
    if (exists) {
      log(`${file}`, 'success');
    } else {
      log(`Missing required file: ${file}`, 'error');
      errors++;
    }
  }
}

async function checkHTMLFiles() {
  log('\nChecking HTML files...', 'info');

  const htmlFiles = [
    'index.html',
    'forecast.html',
    'alerts.html',
    'snowday.html',
    'maps.html',
    'feeds.html',
    'history.html',
    'settings.html',
    'developer.html',
    'about.html',
    'diagnostics.html'
  ];

  for (const file of htmlFiles) {
    const path = join(ROOT, file);
    try {
      const content = await readFile(path, 'utf-8');

      // Check for required elements
      if (!content.includes('<!DOCTYPE html>')) {
        log(`${file}: Missing DOCTYPE`, 'warning');
        warnings++;
      }
      if (!content.includes('<meta charset')) {
        log(`${file}: Missing charset meta`, 'warning');
        warnings++;
      }
      if (!content.includes('viewport')) {
        log(`${file}: Missing viewport meta`, 'warning');
        warnings++;
      }

      log(`${file}: OK`, 'success');
    } catch (err) {
      log(`${file}: Error reading file - ${err.message}`, 'error');
      errors++;
    }
  }
}

async function checkAssetLinks() {
  log('\nChecking asset links in HTML...', 'info');

  const htmlFiles = [
    'index.html',
    'forecast.html',
    'alerts.html',
    'snowday.html',
    'diagnostics.html'
  ];

  const requiredAssets = [
    'assets/styles.css',
    'assets/config.js',
    'assets/ui.js'
  ];

  for (const file of htmlFiles) {
    const path = join(ROOT, file);
    try {
      const content = await readFile(path, 'utf-8');

      for (const asset of requiredAssets) {
        if (!content.includes(asset)) {
          log(`${file}: Missing reference to ${asset}`, 'warning');
          warnings++;
        }
      }
    } catch (err) {
      // Already reported in checkHTMLFiles
    }
  }
}

async function checkJavaScriptSyntax() {
  log('\nChecking JavaScript modules...', 'info');

  const jsFiles = [
    'assets/schema.js',
    'assets/storage.js',
    'assets/api.js',
    'assets/alerts.js',
    'assets/ui.js'
  ];

  for (const file of jsFiles) {
    const path = join(ROOT, file);
    try {
      const content = await readFile(path, 'utf-8');

      // Basic syntax checks
      if (content.includes('TODO') || content.includes('FIXME')) {
        log(`${file}: Contains TODO/FIXME markers`, 'warning');
        warnings++;
      }

      // Check for common issues
      if (content.includes('console.log') && !content.includes('console.error')) {
        // This is fine, just informational
      }

      log(`${file}: OK`, 'success');
    } catch (err) {
      log(`${file}: Error - ${err.message}`, 'error');
      errors++;
    }
  }
}

async function checkTestFiles() {
  log('\nChecking test files...', 'info');

  const testPath = join(ROOT, 'tests');
  try {
    const files = await readdir(testPath);
    const testFiles = files.filter(f => f.endsWith('.test.js'));

    if (testFiles.length === 0) {
      log('No test files found', 'warning');
      warnings++;
    } else {
      log(`Found ${testFiles.length} test files`, 'success');
    }

    // Check for fixtures
    const fixturesPath = join(testPath, 'fixtures');
    const fixturesExist = await fileExists(fixturesPath);
    if (!fixturesExist) {
      log('Fixtures directory missing', 'warning');
      warnings++;
    } else {
      log('Fixtures directory exists', 'success');
    }
  } catch (err) {
    log(`Tests directory error: ${err.message}`, 'error');
    errors++;
  }
}

async function checkConfigFiles() {
  log('\nChecking configuration files...', 'info');

  const configs = [
    { file: 'package.json', required: ['name', 'version', 'scripts'] },
    { file: 'eslint.config.js', required: [] },
    { file: 'vitest.config.js', required: [] }
  ];

  for (const { file, required } of configs) {
    const path = join(ROOT, file);
    const exists = await fileExists(path);

    if (!exists) {
      log(`${file}: Missing`, 'error');
      errors++;
      continue;
    }

    if (file.endsWith('.json')) {
      try {
        const content = await readFile(path, 'utf-8');
        const json = JSON.parse(content);

        for (const key of required) {
          if (!json[key]) {
            log(`${file}: Missing required key "${key}"`, 'warning');
            warnings++;
          }
        }

        log(`${file}: OK`, 'success');
      } catch (err) {
        log(`${file}: Invalid JSON - ${err.message}`, 'error');
        errors++;
      }
    } else {
      log(`${file}: Exists`, 'success');
    }
  }
}

async function run() {
  console.log('🔍 Running smoke tests...\n');

  await checkRequiredFiles();
  await checkHTMLFiles();
  await checkAssetLinks();
  await checkJavaScriptSyntax();
  await checkTestFiles();
  await checkConfigFiles();

  console.log('\n' + '='.repeat(50));
  console.log(`Errors: ${errors}`);
  console.log(`Warnings: ${warnings}`);

  if (errors === 0 && warnings === 0) {
    console.log('\n✅ All smoke tests passed!');
    process.exit(0);
  } else if (errors === 0) {
    console.log('\n⚠️  Smoke tests passed with warnings');
    process.exit(0);
  } else {
    console.log('\n❌ Smoke tests failed');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
