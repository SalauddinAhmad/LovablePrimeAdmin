// Global State Store
let dbRecords = [];

// Tab System
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    item.classList.add('active');
    const tabId = item.getAttribute('data-tab');
    document.getElementById(`tab-${tabId}`).classList.add('active');
  });
});

// Expiry date calculation (Trial & Standard durations)
function calculateExpiry() {
  const durationVal = document.getElementById('keyDuration').value;
  const date = new Date();
  
  if (durationVal === '1h') {
    date.setHours(date.getHours() + 1);
  } else if (durationVal === '1d') {
    date.setDate(date.getDate() + 1);
  } else if (durationVal === '1w') {
    date.setDate(date.getDate() + 7);
  } else {
    const months = parseInt(durationVal);
    date.setMonth(date.getMonth() + months);
  }
  
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  
  document.getElementById('keyExpiry').value = `${yyyy}-${mm}-${dd}`;
}
calculateExpiry();

// Show Toast
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast-notification ${type} show`;
  setTimeout(() => {
    toast.className = 'toast-notification';
  }, 3500);
}

// Load cached credentials or default key on launch
window.onload = () => {
  const cachedKey = localStorage.getItem('prime_service_role_key');
  if (cachedKey && cachedKey.trim() !== '') {
    document.getElementById('dbKey').value = cachedKey;
  }
  // Auto connect if key is present
  const currentKey = document.getElementById('dbKey').value;
  if (currentKey && currentKey.trim() !== '') {
    loadLicenses();
  }
};

// Database API helper
async function supabaseRequest(endpoint, method = 'GET', body = null) {
  const url = document.getElementById('dbUrl').value.trim();
  const key = document.getElementById('dbKey').value.trim();

  if (!url || !key) {
    showToast('Credentials required! Enter Supabase URL and service_role Key.', 'error');
    updateConnectionStatus(false);
    return null;
  }

  localStorage.setItem('prime_service_role_key', key);

  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    const config = { method, headers };
    if (body) {
      config.body = JSON.stringify(body);
    }
    const response = await fetch(`${url}/rest/v1/${endpoint}`, config);
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Database error occurred.');
    }
    
    updateConnectionStatus(true);
    return await response.json();
  } catch (err) {
    showToast(err.message, 'error');
    updateConnectionStatus(false);
    console.error(err);
    return null;
  }
}

// Connection Status Updater
function updateConnectionStatus(isConnected) {
  const bar = document.getElementById('connectionStatus');
  if (isConnected) {
    bar.innerHTML = '<span class="indicator success"></span> Connected';
  } else {
    bar.innerHTML = '<span class="indicator error"></span> Connection Failed';
  }
}

// Load Licenses
async function loadLicenses() {
  const list = await supabaseRequest('licenses?select=*&order=created_at.desc');
  if (!list) return;

  dbRecords = list;
  renderTable(dbRecords);
  updateMetrics(dbRecords);
}

// Render Licenses in Table
function renderTable(records) {
  const tbody = document.getElementById('licenseTableBody');
  tbody.innerHTML = '';

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px 0;">No licenses match the search filter.</td></tr>`;
    return;
  }

  records.forEach(license => {
    const isExpired = new Date(license.expires_at) < new Date();
    
    let statusHtml = '';
    if (!license.is_active) {
      statusHtml = '<span class="status-badge status-inactive">● Inactive</span>';
    } else if (isExpired) {
      statusHtml = '<span class="status-badge status-expired">● Expired</span>';
    } else {
      statusHtml = '<span class="status-badge status-active">● Active</span>';
    }

    const expiryFormatted = new Date(license.expires_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const devices = license.devices || [];
    const deviceDisplay = `${devices.length} / ${license.max_devices}`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="key-badge">${license.key_value}</span></td>
      <td>${statusHtml}</td>
      <td>${expiryFormatted}</td>
      <td>${deviceDisplay}</td>
      <td>
        <div class="action-group">
          <button class="btn-secondary" onclick="toggleActive('${license.id}', ${license.is_active})">
            ${license.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button class="btn-secondary" onclick="resetDevices('${license.id}')">Reset Devices</button>
          <button class="btn-danger" onclick="deleteLicense('${license.id}', '${license.key_value}')">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Search and Filter
function filterLicenses() {
  const query = document.getElementById('searchKeys').value.trim().toUpperCase();
  if (!query) {
    renderTable(dbRecords);
    return;
  }
  const filtered = dbRecords.filter(r => r.key_value.includes(query));
  renderTable(filtered);
}

// Update Dashboard Statistics Metrics
function updateMetrics(records) {
  const total = records.length;
  let active = 0;
  let inactive = 0;
  let totalDevices = 0;

  records.forEach(r => {
    const isExpired = new Date(r.expires_at) < new Date();
    if (r.is_active && !isExpired) {
      active++;
    } else {
      inactive++;
    }
    if (r.devices && Array.isArray(r.devices)) {
      totalDevices += r.devices.length;
    }
  });

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statActive').textContent = active;
  document.getElementById('statInactive').textContent = inactive;
  document.getElementById('statDevices').textContent = totalDevices;
}

// Generate License
async function generateLicense() {
  const prefix = document.getElementById('keyPrefix').value.trim().toUpperCase() || 'PRIME';
  const durationVal = document.getElementById('keyDuration').value;
  const maxDev = parseInt(document.getElementById('maxDevices').value) || 1;
  let expiryTimestamp;

  if (durationVal === '1h') {
    expiryTimestamp = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  } else if (durationVal === '1d') {
    expiryTimestamp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  } else if (durationVal === '1w') {
    expiryTimestamp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  } else {
    const expiry = document.getElementById('keyExpiry').value;
    if (!expiry) {
      showToast('Select an expiration date first.', 'error');
      return;
    }
    expiryTimestamp = new Date(expiry + 'T23:59:59').toISOString();
  }

  // Generate key of format PREFIX-XXXX-XXXX-XXXX
  const randHex = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  const generatedKey = `${prefix}-${randHex()}-${randHex()}-${randHex()}`;

  const newLicense = {
    key_value: generatedKey,
    is_active: true,
    expires_at: expiryTimestamp,
    max_devices: maxDev,
    devices: []
  };

  const result = await supabaseRequest('licenses', 'POST', newLicense);
  if (result) {
    showToast(`Key created: ${generatedKey}`);
    loadLicenses();
  }
}

// Toggle License Status
async function toggleActive(id, currentStatus) {
  const result = await supabaseRequest(`licenses?id=eq.${id}`, 'PATCH', {
    is_active: !currentStatus
  });
  if (result) {
    showToast('License status updated.');
    loadLicenses();
  }
}

// Reset Registered Devices
async function resetDevices(id) {
  if (!confirm('Reset all devices registered on this key?')) return;
  const result = await supabaseRequest(`licenses?id=eq.${id}`, 'PATCH', {
    devices: []
  });
  if (result) {
    showToast('Devices reset successfully.');
    loadLicenses();
  }
}

// Delete License Key
async function deleteLicense(id, keyVal) {
  if (!confirm(`Delete license ${keyVal}? This cannot be undone.`)) return;
  const result = await supabaseRequest(`licenses?id=eq.${id}`, 'DELETE');
  showToast('License deleted.');
  loadLicenses();
}

// Password Gate Check (Default Password: LovablePrime2026)
const CORRECT_HASH = '8f204fdbc685236a374d5982e70c601df74de0e5e5e175474b9dfee2322df39f';

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkGatePassword() {
  const pwd = document.getElementById('gatePassword').value;
  const hash = await sha256(pwd);
  
  if (hash === CORRECT_HASH) {
    sessionStorage.setItem('gate_unlocked', 'true');
    const gate = document.getElementById('loginGate');
    gate.style.opacity = '0';
    setTimeout(() => {
      gate.style.display = 'none';
    }, 400);
    showToast('Dashboard unlocked!');
  } else {
    document.getElementById('gateError').textContent = 'Incorrect password. Access denied.';
  }
}

// Auto-run on load to check unlock status
(function() {
  if (sessionStorage.getItem('gate_unlocked') === 'true') {
    // Hide gate immediately if already unlocked in this browser session
    document.addEventListener('DOMContentLoaded', () => {
      const gate = document.getElementById('loginGate');
      if (gate) gate.style.display = 'none';
    });
  }
})();
