// Shared UI components
window.UI = {
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = 'position: fixed; top: 20px; right: 20px; background: white; padding: 15px 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 1000;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  },
  
  showModal(title, content) {
    const modal = document.getElementById('alert-modal');
    if (!modal) return;
    const body = document.getElementById('alert-modal-body');
    body.innerHTML = `<h2>${title}</h2><div>${content}</div>`;
    modal.classList.remove('hidden');
    
    const close = modal.querySelector('.modal-close');
    close.onclick = () => modal.classList.add('hidden');
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    };
  },
  
  formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    });
  },
  
  formatTemp(temp, units = 'F') {
    return `${Math.round(temp)}°${units}`;
  }
};

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  const banner = document.getElementById('error-banner');
  if (banner) {
    banner.textContent = `Error: ${event.error?.message || 'Something went wrong'}. Check Diagnostics page.`;
    banner.classList.remove('hidden');
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
