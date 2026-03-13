/**
 * Shared dashboard header component
 * Shows current date/time, logged-in user name, compact sign-out button, greeting
 */

// DOM elements
let headerUserEl, headerDateTimeEl, logoutBtn, headerContainer;

function initHeader() {
  // Find elements (supports admin/manager/employee pages)
  headerUserEl = document.getElementById('dashboard-user') || 
                 document.querySelector('.dashboard-header-user') ||
                 document.querySelector('header [data-user]');
  headerDateTimeEl = document.getElementById('dashboard-datetime') || 
                     document.querySelector('.dashboard-header-datetime') ||
                     document.querySelector('header [data-datetime]');
  logoutBtn = document.getElementById('compact-logout') || 
              document.querySelector('#logoutBtn') ||
              document.querySelector('header button[type="button"]');
  headerContainer = document.querySelector('header') || document.querySelector('.dashboard-header');
  
  if (!headerContainer) return console.warn('No header found');
  
  updateGreeting();
  updateDateTime();
  setupClock();
  setupCompactLogout();
  
  // Listen for auth changes
  const authImports = ['getAuth', 'onAuthStateChanged'];
  if (typeof window.auth !== 'undefined' && window.auth.onAuthStateChanged) {
    window.auth.onAuthStateChanged(onUserChange);
  }
}

// Update greeting with user name
function updateGreeting() {
  if (!headerUserEl) return;
  
  const user = window.auth?.currentUser;
  const displayName = user?.displayName || 
                     (user?.email?.split('@')[0] || '').replace(/[.]/g, ' ') ||
                     localStorage.getItem('displayName') ||
                     'User';
  
  const hour = new Date().getHours();
  let greeting = '';
  if (hour < 12) greeting = `Good morning,`;
  else if (hour < 17) greeting = `Good afternoon,`;
  else greeting = `Good evening,`;
  
  headerUserEl.textContent = `${greeting} ${displayName}`;
  headerUserEl.title = `Logged in as: ${user?.email || 'Unknown'}`;
}

// Live updating date/time
function updateDateTime() {
  if (!headerDateTimeEl) return;
  
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
  const dateStr = now.toLocaleDateString('en-NP', { 
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  
  headerDateTimeEl.innerHTML = `
    <span class="datetime-date">${dateStr}</span>
    <span class="datetime-time">${timeStr}</span>
  `;
}

// Clock ticker
function setupClock() {
  setInterval(updateDateTime, 30000); // Update every 30s
}

// Make logout button compact/icon-only
function setupCompactLogout() {
  if (!logoutBtn) return;
  
  logoutBtn.innerHTML = '↗';
  logoutBtn.title = 'Sign out';
  logoutBtn.style.fontSize = '1rem';
  logoutBtn.style.padding = '0.4rem';
  logoutBtn.style.minWidth = '32px';
  logoutBtn.style.borderRadius = '50%';
  
  logoutBtn.addEventListener('mouseenter', () => {
    logoutBtn.innerHTML = 'Sign Out';
    logoutBtn.style.minWidth = 'auto';
    logoutBtn.style.padding = '0.35rem 0.75rem';
  });
  
  logoutBtn.addEventListener('mouseleave', () => {
    logoutBtn.innerHTML = '↗';
    logoutBtn.style.minWidth = '32px';
    logoutBtn.style.padding = '0.4rem';
  });
}

// Handle user change
function onUserChange(user) {
  if (user) {
    const displayName = user.displayName || user.email?.split('@')[0]?.replace(/[.]/g, ' ') || 'User';
    localStorage.setItem('displayName', displayName);
    updateGreeting();
  } else {
    localStorage.removeItem('displayName');
  }
}

// Export for use in other modules
window.dashboardHeader = { init: initHeader };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHeader);
} else {
  initHeader();
}

