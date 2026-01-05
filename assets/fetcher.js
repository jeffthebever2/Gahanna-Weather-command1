/**
 * fetcher.js
 * fetch() wrapper with timeout + simple retry.
 */

export async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (err) {
    clearTimeout(timeout);
    if (err && err.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw err;
  }
}

export async function fetchWithRetry(url, options = {}, retries = 1, timeoutMs = 6000) {
  try {
    return await fetchWithTimeout(url, options, timeoutMs);
  } catch (err) {
    const msg = String(err?.message || err);
    const isTimeout = msg.toLowerCase().includes('timeout');
    if (retries > 0 && isTimeout) {
      return await fetchWithRetry(url, options, retries - 1, timeoutMs);
    }
    throw err;
  }
}

if (typeof window !== 'undefined') {
  window.fetchWithTimeout = fetchWithTimeout;
  window.fetchWithRetry = fetchWithRetry;
}

// In tests, Vitest uses globalThis; mirror there too.
globalThis.fetchWithTimeout = globalThis.fetchWithTimeout || fetchWithTimeout;
globalThis.fetchWithRetry = globalThis.fetchWithRetry || fetchWithRetry;
