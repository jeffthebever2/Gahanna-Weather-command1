/**
 * Cloudflare Worker - RSS CORS Proxy
 * 
 * This optional Worker bypasses CORS restrictions for RSS feeds.
 * 
 * Setup:
 * 1. Install Wrangler: npm install -g wrangler
 * 2. Deploy: wrangler publish extras/rss-proxy-worker.js
 * 3. Update config.js with Worker URL
 * 
 * Usage:
 * fetch('https://your-worker.workers.dev/?url=' + encodeURIComponent(feedUrl))
 */

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    
    try {
      const url = new URL(request.url);
      const feedUrl = url.searchParams.get('url');
      
      if (!feedUrl) {
        return new Response('Missing url parameter', { status: 400 });
      }
      
      // Validate URL
      try {
        new URL(feedUrl);
      } catch {
        return new Response('Invalid URL', { status: 400 });
      }
      
      // Fetch RSS feed
      const response = await fetch(feedUrl, {
        headers: {
          'User-Agent': 'Gahanna-Weather-Command/1.0'
        }
      });
      
      if (!response.ok) {
        return new Response(`Feed fetch failed: ${response.status}`, { 
          status: response.status 
        });
      }
      
      const content = await response.text();
      
      // Return with CORS headers
      return new Response(content, {
        headers: {
          'Content-Type': 'application/xml',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300' // 5 minutes
        }
      });
      
    } catch (err) {
      return new Response(`Error: ${err.message}`, { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
