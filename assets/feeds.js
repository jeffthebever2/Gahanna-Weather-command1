// Feeds page - RSS and monitoring
window.initFeedsPage = function() {
  loadRSSFeeds();
  loadSourceLinks();
  loadScannerLinks();
  loadQuickNotes();
  updateSignals();
  
  document.getElementById('save-notes').addEventListener('click', saveQuickNotes);
};

async function loadRSSFeeds() {
  const container = document.getElementById('rss-feeds');
  const settings = window.Storage.getSettings();
  
  if (settings.feedUrls.length === 0) {
    container.innerHTML = '<p>No RSS feeds configured. Add feeds in Settings.</p>';
    return;
  }
  
  container.innerHTML = '<p>Loading feeds...</p>';
  
  const allItems = [];
  
  for (const url of settings.feedUrls) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');
      
      const items = Array.from(xml.querySelectorAll('item')).slice(0, 5).map(item => ({
        title: item.querySelector('title')?.textContent || 'No title',
        link: item.querySelector('link')?.textContent || '#',
        pubDate: item.querySelector('pubDate')?.textContent || '',
        source: new URL(url).hostname
      }));
      
      allItems.push(...items);
    } catch (err) {
      console.error('RSS fetch failed for', url, err);
      allItems.push({
        title: `Feed unavailable: ${new URL(url).hostname}`,
        link: '#',
        pubDate: '',
        source: url,
        error: true
      });
    }
  }
  
  if (allItems.length === 0) {
    container.innerHTML = `
      <div class="info-box">
        <p><strong>RSS feeds blocked by CORS.</strong></p>
        <p>Browser security prevents direct RSS access. Options:</p>
        <ul>
          <li>Use the optional Cloudflare Worker proxy (see /extras/rss-proxy-worker.js)</li>
          <li>Manually paste feed items in Quick Notes</li>
        </ul>
      </div>
    `;
  } else {
    container.innerHTML = allItems.map(item => `
      <div class="feed-item" style="margin-bottom: 15px; padding: 10px; background: var(--gray-50); border-radius: 6px;">
        ${item.error ? 
          `<div style="color: var(--danger);">${item.title}</div>` :
          `<a href="${item.link}" target="_blank" style="font-weight: 600; color: var(--primary);">${item.title}</a>
           <div style="font-size: 12px; color: var(--gray-600); margin-top: 5px;">${item.source} - ${item.pubDate}</div>`
        }
      </div>
    `).join('');
  }
}

function loadSourceLinks() {
  const container = document.getElementById('source-links');
  const settings = window.Storage.getSettings();
  
  container.innerHTML = settings.sourceLinks.map(link => `
    <div style="margin-bottom: 10px;">
      <a href="${link.url}" target="_blank" class="btn btn-secondary" style="width: 100%; text-decoration: none; text-align: left;">
        ${link.name}
      </a>
    </div>
  `).join('');
}

function loadScannerLinks() {
  const container = document.getElementById('scanner-links');
  const settings = window.Storage.getSettings();
  
  container.innerHTML = settings.scannerLinks.map(link => `
    <div style="margin-bottom: 10px;">
      <a href="${link.url}" target="_blank" class="btn btn-secondary" style="width: 100%; text-decoration: none; text-align: left;">
        ${link.name}
      </a>
    </div>
  `).join('');
}

function loadQuickNotes() {
  const notes = window.Storage.getNotes();
  document.getElementById('quick-notes').value = notes;
}

function saveQuickNotes() {
  const notes = document.getElementById('quick-notes').value;
  window.Storage.saveNotes(notes);
  window.UI.showToast('Notes saved', 'success');
}

function updateSignals() {
  const container = document.getElementById('signals-detected');
  const notes = window.Storage.getNotes().toLowerCase();
  
  const keywords = {
    ice: ['ice', 'icy', 'slippery'],
    crash: ['crash', 'accident', 'collision'],
    closure: ['closed', 'closure', 'closing'],
    delay: ['delay', 'delayed', '2 hour']
  };
  
  const detected = {};
  Object.entries(keywords).forEach(([key, words]) => {
    detected[key] = words.filter(w => notes.includes(w)).length;
  });
  
  const total = Object.values(detected).reduce((a, b) => a + b, 0);
  
  container.innerHTML = `
    <h3>Signals Detected: ${total}</h3>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin-top: 15px;">
      ${Object.entries(detected).map(([key, count]) => `
        <div style="text-align: center; padding: 10px; background: ${count > 0 ? 'var(--warning)' : 'var(--gray-100)'}; color: ${count > 0 ? 'white' : 'var(--gray-600)'}; border-radius: 6px;">
          <div style="font-size: 24px; font-weight: 700;">${count}</div>
          <div style="font-size: 12px; text-transform: capitalize;">${key}</div>
        </div>
      `).join('')}
    </div>
  `;
}
