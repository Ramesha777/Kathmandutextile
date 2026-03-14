// manager.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  query,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// caches
let employees = [];
let rates = { machine: [], production: [], daily: [] };

//
const toastEl = document.getElementById('toast');
const managerSignOutBtn = document.getElementById('btnSignOut');
const navItems = document.querySelectorAll('.manager-nav-link');

const inpEmployee = document.getElementById('wage-employee');
const inpEmployeeId = document.getElementById('wage-employee-id');
const datalistEmployee = document.getElementById('employee-list');
const inpDate = document.getElementById('wage-date');
const selDept = document.getElementById('wage-dept');
const selItem = document.getElementById('wage-item');
const inpQty = document.getElementById('wage-qty');
const inpUnit = document.getElementById('wage-unit');
const inpRate = document.getElementById('wage-rate');
const inpOT = document.getElementById('wage-ot');
const inpBonus = document.getElementById('wage-bonus');
const inpDeduct = document.getElementById('wage-deduct');
const btnSave = document.getElementById('btn-save-wage');
const btnClear = document.getElementById('btn-clear-wage');

const tblEmployeesBody = document.querySelector('#tbl-employees tbody');
const tblWageEntriesBody = document.querySelector('#tbl-wage-entries tbody');
const selSlipEmployee = document.getElementById('slip-employee');
const selSlipYear = document.getElementById('slip-year');
const selSlipMonth = document.getElementById('slip-month');
const btnPreviewSlip = document.getElementById('btn-preview-slip');
const btnDownloadSlip = document.getElementById('btn-download-slip');
const btnShareSlip = document.getElementById('btn-share-slip');
const shareModal = document.getElementById('share-modal');
const btnShareEmail = document.getElementById('btn-share-email');
const btnShareWhatsApp = document.getElementById('btn-share-whatsapp');
const btnCancelShare = document.getElementById('btn-cancel-share');
const modalCloseShare = document.getElementById('modal-close-share');
const managerInventoryListEl = document.getElementById('managerInventoryList');
const managerInventoryCategoryFilterEl = document.getElementById('managerInventoryCategoryFilter');
const managerDamageReportsListEl = document.getElementById('managerDamageReportsList');
const managerOrdersListEl = document.getElementById('managerOrdersList');
const orderSearchQueryEl = document.getElementById('orderSearchQuery');
const orderStatusFilterEl = document.getElementById('orderStatusFilter');

let deleteDamageId = null;
const deleteDamageModal = document.getElementById('delete-damage-modal');
const deleteDamageDetails = document.getElementById('delete-damage-details');
const btnConfirmDamageDelete = document.getElementById('btn-confirm-damage-delete');
const btnCancelDamageDelete = document.getElementById('btn-cancel-damage-delete');
const modalCloseDamageDelete = document.getElementById('modal-close-damage-delete');

let deleteWageId = null;
const deleteWageModal = document.getElementById('delete-wage-modal');
const deleteWageDetails = document.getElementById('delete-wage-details');
const btnConfirmWageDelete = document.getElementById('btn-confirm-delete');
const btnCancelWageDelete = document.getElementById('btn-cancel-delete');
const modalCloseWageDelete = document.getElementById('modal-close-delete');

let managerInventoryItems = [];
let managerUserNameByUid = {};

// Employee search elements
const employeeSearchInput = document.getElementById('employee-search');
const employeeModal = document.getElementById('employee-modal');
const employeeModalBody = document.getElementById('employee-modal-body');
const modalCloseEmployee = document.getElementById('modal-close-employee');

function showToast(msg, type = 'success') {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = `toast ${type} show`;
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// protect page
onAuthStateChanged(auth, user => {
  if (!user) location.href = 'index.html';
});

// Logout button
if (managerSignOutBtn) {
  managerSignOutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      window.location.replace("login.html");
    } catch (e) {
      console.error(e);
      showToast('Logout failed', 'error');
    }
  });
}


// nav
navItems.forEach(it => {
  it.addEventListener('click', () => {
    navItems.forEach(x => x.classList.remove('active'));
    it.classList.add('active');
    document.querySelectorAll('.manager-panel').forEach(panel => panel.classList.remove('active'));
    const section = it.dataset.section;
    document.getElementById('panel-' + section)?.classList.add('active');

    // Hide performance iframe when switching away
    const perfContainer = document.getElementById('performance-iframe-container');
    if (perfContainer) {
      perfContainer.style.display = section === 'performance' ? 'block' : 'none';
    }

    if (section === 'inventory') {
      loadManagerInventory();
    }
    if (section === 'damage-reports') {
      loadManagerDamageReports();
    }
    if (section === 'orders') {
      loadManagerOrders();
    }
    if (section === 'performance') {
      let perfPanel = document.getElementById('panel-performance');
      if (perfPanel) {
        if (!perfPanel.querySelector('iframe')) {
          perfPanel.innerHTML = `
            <iframe src="performance.html" 
                    style="width:100%; height:calc(100vh - 80px); min-height:700px; border:none; border-radius:12px;"
                    scrolling="auto"
                    allowfullscreen>
            </iframe>
          `;
        }
      }
    }
  });
});

// load employees and rates
async function loadEmployees() {
  try {
    const snap = await getDocs(collection(db, 'employees'));
    employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Populate datalist for employee autocomplete
    datalistEmployee.innerHTML = employees.map(e => {
      const displayName = `${e.fullName || e.name || e.email || e.id} (${e.department || 'NoDept'})`;
      return `<option value="${displayName}" data-id="${e.id}">`;
    }).join('');

    // Fill slip-employee select (for payslip section)
    selSlipEmployee.innerHTML = '<option value="">Select employee</option>' + employees.map(e => `<option value="${e.id}">${e.fullName || e.name || e.email || e.id}</option>`).join('');

    // Fill slip-year select
    if (selSlipYear) {
      const currentYear = new Date().getFullYear();
      selSlipYear.innerHTML = '';
      for (let y = currentYear; y >= currentYear - 5; y--) {
        const opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        if (y === currentYear) opt.selected = true;
        selSlipYear.appendChild(opt);
      }
    }

    if (tblEmployeesBody) {
      renderEmployeeTable(employees);
    }
    
    // Setup search listener
    if (employeeSearchInput) {
      employeeSearchInput.addEventListener('input', () => {
        filterEmployees();
      });
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to load employees', 'error');
  }
}

function renderEmployeeTable(empList) {
  if (!tblEmployeesBody) return;
  tblEmployeesBody.innerHTML = '';
  
  if (empList.length === 0) {
    tblEmployeesBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No employees found</td></tr>';
    return;
  }
  
  empList.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(e.id || '—')}</td>
      <td>${escapeHtml(e.fullName||e.name||'—')}</td>
      <td>${escapeHtml(e.email||'—')}</td>
      <td>${escapeHtml(e.department||'—')}</td>
      <td>${escapeHtml(e.position||'—')}</td>
      <td><button type="button" class="btn btn-sm btn-primary btn-view-employee" data-id="${e.id}">View</button></td>
    `;
    tblEmployeesBody.appendChild(tr);
  });
  
  // Add click listeners to view buttons
  tblEmployeesBody.querySelectorAll('.btn-view-employee').forEach(btn => {
    btn.addEventListener('click', () => {
      const empId = btn.getAttribute('data-id');
      const emp = employees.find(e => e.id === empId);
      if (emp) {
        showEmployeeModal(emp);
      }
    });
  });
}

function filterEmployees() {
  if (!employeeSearchInput) return;
  const searchTerm = employeeSearchInput.value.toLowerCase().trim();
  
  if (!searchTerm) {
    renderEmployeeTable(employees);
    return;
  }
  
  const filtered = employees.filter(e => {
    const name = (e.fullName || e.name || '').toLowerCase();
    const id = (e.id || '').toLowerCase();
    return name.includes(searchTerm) || id.includes(searchTerm);
  });
  
  renderEmployeeTable(filtered);
}

function escapeHtml(str) {
  if (!str) return '—';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showEmployeeModal(emp) {
  if (!employeeModal || !employeeModalBody) return;
  
  // Generate photo HTML
  let photoHtml = '';
  if (emp.photoUrl) {
    photoHtml = `
      <div class="employee-modal-photo-wrap">
        <img src="${escapeHtml(emp.photoUrl)}" alt="${escapeHtml(emp.fullName || 'Employee')}" class="employee-modal-photo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <div class="employee-modal-photo-placeholder" style="display: none;">
          <span>${escapeHtml((emp.fullName || 'E').charAt(0).toUpperCase())}</span>
        </div>
      </div>
    `;
  } else {
    photoHtml = `
      <div class="employee-modal-photo-wrap">
        <div class="employee-modal-photo-placeholder">
          <span>${escapeHtml((emp.fullName || 'E').charAt(0).toUpperCase())}</span>
        </div>
      </div>
    `;
  }
  
  // Generate ID Photo HTML
  let idPhotoHtml = '';
  if (emp.personalIdPhotoUrl) {
    idPhotoHtml = `
      <div class="employee-modal-id-photo">
        <a href="${escapeHtml(emp.personalIdPhotoUrl)}" target="_blank" title="View ID">
          <img src="${escapeHtml(emp.personalIdPhotoUrl)}" alt="ID Photo" onerror="this.parentElement.style.display='none';">
        </a>
      </div>
    `;
  } else {
    idPhotoHtml = `<div class="employee-modal-no-photo">No ID photo</div>`;
  }
  
  const modalContent = `
    <div class="employee-modal-card">
      <div class="employee-modal-header">
        <div class="employee-modal-header-info">
          <h4>${escapeHtml(emp.fullName || emp.name || 'Employee')}</h4>
          <span class="employee-badge">ID: ${escapeHtml(emp.id || '—')}</span>
        </div>
        ${photoHtml}
      </div>
      <div class="employee-modal-body-section">
        <h5>Contact Information</h5>
        <div class="employee-modal-grid">
          <div><strong>Department:</strong> ${escapeHtml(emp.department || '—')}</div>
          <div><strong>Phone:</strong> ${escapeHtml(emp.phone || '—')}</div>
          <div><strong>Email:</strong> ${escapeHtml(emp.email || '—')}</div>
          <div><strong>Address:</strong> ${escapeHtml(emp.address || '—')}</div>
        </div>
      </div>
      <div class="employee-modal-body-section">
        <h5>Bank Details</h5>
        <div class="employee-modal-grid">
          <div><strong>Bank Name:</strong> ${escapeHtml(emp.bankName || '—')}</div>
          <div><strong>Account Number:</strong> ${escapeHtml(emp.bankAccountNumber || '—')}</div>
          <div><strong>Account Holder:</strong> ${escapeHtml(emp.accountHolderName || '—')}</div>
        </div>
      </div>
      <div class="employee-modal-body-section">
        <h5>ID Information</h5>
        <div class="employee-modal-grid">
          <div><strong>ID Type:</strong> ${escapeHtml(emp.personalIdType || '—')}</div>
          <div><strong>ID Number:</strong> ${escapeHtml(emp.personalIdNumber || '—')}</div>
        </div>
        <div class="employee-modal-id-section">
          ${idPhotoHtml}
        </div>
      </div>
    </div>
  `;
  
  employeeModalBody.innerHTML = modalContent;
  employeeModal.style.display = 'flex';
}

function closeEmployeeModal() {
  if (employeeModal) {
    employeeModal.style.display = 'none';
  }
}

// Modal close event listeners
if (modalCloseEmployee) {
  modalCloseEmployee.addEventListener('click', closeEmployeeModal);
}

if (employeeModal) {
  employeeModal.addEventListener('click', (e) => {
    if (e.target === employeeModal) {
      closeEmployeeModal();
    }
  });
}

async function loadRates() {
  try {
    const [mSnap,pSnap,dSnap] = await Promise.all([
      getDocs(collection(db,'rates_machineOperators')),
      getDocs(collection(db,'rates_productions')),
      getDocs(collection(db,'rates_daily'))
    ]);
    rates.machine = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    rates.production = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    rates.daily = dSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    populateWageItemSelect();
  } catch (e) {
    console.warn('loadRates failed', e);
  }
}

// Load user map (used for orders display)
async function loadManagerUserNameMap() {
  try {
    const snap = await getDocs(collection(db, 'users'));
    snap.forEach(d => {
      const u = d.data() || {};
      managerUserNameByUid[d.id] = u.displayName || u.fullName || u.name || d.id || 'Unknown';
    });
  } catch (err) {
    console.warn('loadManagerUserNameMap failed:', err);
  }
}

// Populate wage item/work type based on department
function populateWageItemSelect() {
  if (!selItem || !selDept) return;
  const dept = selDept.value;
  selItem.innerHTML = '<option value="">Select item</option>';
  let items = [];
  let defaultUnit = '';
  if (dept === 'Machine Operators') {
    items = rates.machine.map(r => ({ name: r.name || r.label || r.id, rate: r.ratePerMeter ?? r.rate ?? 0, unit: 'meter' }));
    defaultUnit = 'meter';
  } else if (dept === 'Production') {
    items = rates.production.map(r => ({ name: r.name || r.label || r.id, rate: r.ratePerPiece ?? r.rate ?? 0, unit: 'piece' }));
    defaultUnit = 'piece';
  } else if (dept === 'Daily Workers') {
    items = rates.daily.map(r => ({ name: r.label || r.name || r.id, rate: r.hourlyRate ?? r.rate ?? 0, unit: 'hour' }));
    defaultUnit = 'hour';
  }
  items.forEach(it => {
    const opt = document.createElement('option');
    opt.value = it.name;
    opt.dataset.rate = String(it.rate);
    opt.dataset.unit = it.unit;
    selItem.appendChild(opt);
  });
  if (inpUnit && defaultUnit) inpUnit.value = defaultUnit;
}

// Auto-fill rate when item selected
function onWageItemChange() {
  if (!selItem || !inpRate) return;
  const opt = selItem.options[selItem.selectedIndex];
  if (opt && opt.dataset.rate) {
    inpRate.value = opt.dataset.rate;
    if (inpUnit && opt.dataset.unit) inpUnit.value = opt.dataset.unit;
  } else {
    inpRate.value = '';
  }
}

// Sync employee id from datalist selection
function onWageEmployeeInput() {
  if (!inpEmployee || !inpEmployeeId) return;
  const val = inpEmployee.value.trim();
  const opt = Array.from(datalistEmployee.querySelectorAll('option')).find(o => o.value === val);
  if (opt) {
    inpEmployeeId.value = opt.dataset.id || '';
  } else {
    const emp = employees.find(e => {
      const disp = `${e.fullName || e.name || e.email || e.id} (${e.department || 'NoDept'})`;
      return disp === val || (e.fullName || e.name || '').toLowerCase().includes(val.toLowerCase()) || e.id === val;
    });
    inpEmployeeId.value = emp ? emp.id : '';
  }
}

// Load manager inventory
async function loadManagerInventory() {
  if (!managerInventoryListEl) return;
  managerInventoryListEl.innerHTML = '<p class="loading-msg">Loading inventory…</p>';
  try {
    const snap = await getDocs(collection(db, 'inventory'));
    managerInventoryItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    managerInventoryItems.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));

    const categories = [...new Set(managerInventoryItems.map(x => String(x.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const currentVal = managerInventoryCategoryFilterEl?.value || '';
    managerInventoryCategoryFilterEl.innerHTML = '<option value="">All categories</option>' + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (currentVal && categories.includes(currentVal)) managerInventoryCategoryFilterEl.value = currentVal;

    renderManagerInventory();
  } catch (err) {
    managerInventoryListEl.innerHTML = '<p class="error">Failed to load inventory: ' + escapeHtml(err.message || err) + '</p>';
  }
}

function renderManagerInventory() {
  if (!managerInventoryListEl) return;
  const cat = managerInventoryCategoryFilterEl?.value || '';
  const items = cat ? managerInventoryItems.filter(x => String(x.category || '').trim() === cat) : managerInventoryItems;
  if (items.length === 0) {
    managerInventoryListEl.innerHTML = '<p class="empty-msg">No inventory items for selected category.</p>';
    return;
  }
  let html = `
    <table class="manager-table">
      <thead><tr><th>Barcode/ID</th><th>Name</th><th>Category</th><th>Qty</th><th>Unit</th><th>Vendor</th><th>Storage</th></tr></thead>
      <tbody>`;
  for (const x of items) {
    const qty = x.quantity != null ? x.quantity : '—';
    html += `
      <tr>
        <td>${escapeHtml(x.barcode)}</td>
        <td>${escapeHtml(x.name)}</td>
        <td>${escapeHtml(x.category)}</td>
        <td>${escapeHtml(qty)}</td>
        <td>${escapeHtml(x.unit || x.units || '—')}</td>
        <td>${escapeHtml(x.vendorName || '—')}</td>
        <td>${escapeHtml(x.storageArea || '—')}</td>
      </tr>`;
  }
  html += '</tbody></table>';
  managerInventoryListEl.innerHTML = html;
}

// Load manager damage reports (problem_reports)
async function loadManagerDamageReports() {
  if (!managerDamageReportsListEl) return;
  managerDamageReportsListEl.innerHTML = '<p class="loading-msg">Loading damage reports…</p>';
  try {
    const snap = await getDocs(collection(db, 'problem_reports'));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.reportedAt?.toMillis?.() ?? 0) - (a.reportedAt?.toMillis?.() ?? 0));
    if (items.length === 0) {
      managerDamageReportsListEl.innerHTML = '<p class="empty-msg">No damage reports yet.</p>';
      return;
    }
    let html = `
      <table class="manager-table">
        <thead><tr><th>Barcode/ID</th><th>Product</th><th>Qty</th><th>Unit</th><th>Explanation</th><th>Reported at</th><th>Action</th></tr></thead>
        <tbody>`;
    for (const x of items) {
      let reportedAt = '—';
      if (x.reportedAt?.toDate) {
        try { reportedAt = x.reportedAt.toDate().toLocaleString(); } catch (_) {}
      }
      html += `
        <tr>
          <td>${escapeHtml(x.barcode)}</td>
          <td>${escapeHtml(x.name)}</td>
          <td>${escapeHtml(x.quantity != null ? x.quantity : '—')}</td>
          <td>${escapeHtml(x.unit || x.units || '—')}</td>
          <td>${escapeHtml(x.explanation)}</td>
          <td>${escapeHtml(reportedAt)}</td>
          <td>
            <button type="button" class="btn btn-sm btn-danger btn-delete-damage"
                    data-id="${x.id}"
                    data-name="${escapeHtml(x.name || '—')}"
                    data-barcode="${escapeHtml(x.barcode || '—')}"
                    data-qty="${escapeHtml(x.quantity != null ? x.quantity : '—')}"
                    data-explanation="${escapeHtml(x.explanation || '—')}"
                    title="Delete this damage report">
              🗑️ Delete
            </button>
          </td>
        </tr>`;
    }
    html += '</tbody></table>';
    managerDamageReportsListEl.innerHTML = html;

    // Attach delete click listeners
    managerDamageReportsListEl.querySelectorAll('.btn-delete-damage').forEach(btn => {
      btn.addEventListener('click', () => openDamageDeleteModal(btn));
    });
  } catch (err) {
    managerDamageReportsListEl.innerHTML = '<p class="error">Failed to load reports: ' + escapeHtml(err.message || err) + '</p>';
  }
}

// Load manager orders with approve/reject
async function loadManagerOrders() {
  if (!managerOrdersListEl) return;
  managerOrdersListEl.innerHTML = '<p class="loading-msg">Loading orders…</p>';
  try {
    const snap = await getDocs(collection(db, 'orders'));
    let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

    const search = (orderSearchQueryEl?.value || '').toLowerCase().trim();
    const statusFilter = orderStatusFilterEl?.value || '';
    if (search) {
      items = items.filter(o =>
        (String(o.supplierContact || '')).toLowerCase().includes(search) ||
        (String(o.supplierName || '')).toLowerCase().includes(search)
      );
    }
    if (statusFilter) {
      items = items.filter(o => (String(o.status || '')).toLowerCase() === statusFilter.toLowerCase());
    }

    if (items.length === 0) {
      managerOrdersListEl.innerHTML = '<p class="empty-msg">No orders found.</p>';
      return;
    }

    let html = `
      <table class="manager-table">
        <thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Supplier</th><th>Contact</th><th>Delivery</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>`;
    for (const o of items) {
      const deliveryDate = o.deliveryDate || '—';
      const status = (o.status || 'pending').toLowerCase();
      const productEsc = escapeHtml(o.productName || '—');
      html += `
        <tr>
          <td>${escapeHtml(o.productName || '—')}</td>
          <td>${o.quantity ?? '—'}</td>
          <td>${escapeHtml(o.unit || '—')}</td>
          <td>${escapeHtml(o.supplierName || '—')}</td>
          <td>${escapeHtml(o.supplierContact || '—')}</td>
          <td>${escapeHtml(deliveryDate)}</td>
          <td><span class="status-badge status-${status}">${escapeHtml(status)}</span></td>
          <td>
            <div class="order-actions-dropdown">
              <button type="button" class="btn btn-sm btn-outline order-actions-trigger" data-id="${o.id}" data-product="${productEsc}">Actions ▾</button>
              <div class="order-actions-menu">
                <button type="button" class="order-action-item" data-action="pending">Pending</button>
                <button type="button" class="order-action-item" data-action="approved">Approved</button>
                <button type="button" class="order-action-item" data-action="completed">Completed</button>
                <hr class="order-action-divider">
                <button type="button" class="order-action-item order-action-delete" data-action="delete">Delete</button>
              </div>
            </div>
          </td>
        </tr>`;
    }
    html += '</tbody></table>';
    managerOrdersListEl.innerHTML = html;

    managerOrdersListEl.querySelectorAll('.order-actions-trigger').forEach(trigger => {
      const dropdown = trigger.closest('.order-actions-dropdown');
      const menu = dropdown?.querySelector('.order-actions-menu');
      const orderId = trigger.dataset.id;
      const productName = trigger.dataset.product;
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.order-actions-menu.show').forEach(m => m.classList.remove('show'));
        menu?.classList.toggle('show');
      });
      menu?.querySelectorAll('.order-action-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = item.dataset.action;
          if (action === 'delete') deleteOrder(orderId, productName);
          else updateOrderStatus(orderId, action);
          menu?.classList.remove('show');
        });
      });
    });
  } catch (err) {
    console.error('Failed to load orders:', err);
    managerOrdersListEl.innerHTML = '<p class="error">Failed to load orders: ' + escapeHtml(err.message || err) + '</p>';
  }
}

async function updateOrderStatus(orderId, status) {
  try {
    await updateDoc(doc(db, 'orders', orderId), { status, updatedAt: serverTimestamp() });
    showToast(`Order ${status}.`, 'success');
    loadManagerOrders();
  } catch (err) {
    showToast('Failed to update order: ' + (err.message || err), 'error');
  }
}

async function deleteOrder(orderId, productName) {
  if (!confirm(`Delete order for "${productName}"? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, 'orders', orderId));
    showToast('Order deleted.', 'success');
    loadManagerOrders();
  } catch (err) {
    showToast('Failed to delete order: ' + (err.message || err), 'error');
  }
}

// Order filter listeners (attach once, after DOM ready)
if (orderSearchQueryEl) {
  orderSearchQueryEl.addEventListener('input', () => loadManagerOrders());
  orderSearchQueryEl.addEventListener('change', () => loadManagerOrders());
}
if (orderStatusFilterEl) {
  orderStatusFilterEl.addEventListener('change', () => loadManagerOrders());
}

// Close order action dropdowns when clicking outside
document.addEventListener('click', () => {
  managerOrdersListEl?.querySelectorAll('.order-actions-menu.show').forEach(m => m.classList.remove('show'));
});

// ── Open damage delete confirmation modal ──
function openDamageDeleteModal(btn) {
  deleteDamageId = btn.dataset.id;
  const name = btn.dataset.name;
  const barcode = btn.dataset.barcode;
  const qty = btn.dataset.qty;
  const explanation = btn.dataset.explanation;

  if (deleteDamageDetails) {
    deleteDamageDetails.innerHTML = `
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;">
        <span style="color:#94a3b8;">Barcode:</span><span style="color:#f0f4ff;font-weight:600;">${barcode}</span>
        <span style="color:#94a3b8;">Product:</span><span style="color:#f0f4ff;">${name}</span>
        <span style="color:#94a3b8;">Qty:</span><span style="color:#f0f4ff;">${qty}</span>
        <span style="color:#94a3b8;">Issue:</span><span style="color:#f0f4ff;">${explanation}</span>
      </div>
    `;
  }

  if (deleteDamageModal) deleteDamageModal.style.display = 'flex';
}

// ── Close damage delete modal ──
function closeDamageDeleteModal() {
  deleteDamageId = null;
  if (deleteDamageModal) deleteDamageModal.style.display = 'none';
}

// ── Confirm damage delete ──
async function confirmDeleteDamage() {
  if (!deleteDamageId) return;

  const btn = btnConfirmDamageDelete;
  const originalText = btn.textContent;

  try {
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    btn.style.opacity = '0.6';

    await deleteDoc(doc(db, 'problem_reports', deleteDamageId));

    showToast('Damage report deleted — problem resolved ✔', 'success');
    closeDamageDeleteModal();

    // Reload the table
    await loadManagerDamageReports();

  } catch (err) {
    console.error('Failed to delete damage report:', err);
    showToast('Failed to delete: ' + (err.message || err), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    btn.style.opacity = '1';
  }
}

// ── Damage delete modal event listeners ──
if (btnConfirmDamageDelete) {
  btnConfirmDamageDelete.addEventListener('click', confirmDeleteDamage);
}

if (btnCancelDamageDelete) {
  btnCancelDamageDelete.addEventListener('click', closeDamageDeleteModal);
}

if (modalCloseDamageDelete) {
  modalCloseDamageDelete.addEventListener('click', closeDamageDeleteModal);
}

if (deleteDamageModal) {
  deleteDamageModal.addEventListener('click', (e) => {
    if (e.target === deleteDamageModal) closeDamageDeleteModal();
  });
}

// ─── Company & Payslip ───
const COMPANY = {
  name: 'KATHMANDU TEXTILE TRADER PVT. LTD.',
  address: 'Balaju, Kathmandu, Nepal',
  phone: '+977-1-XXXXXXX',
  email: 'info@ktt.com',
  panVat: 'PAN/VAT: 123456789',
  location: 'Tarakeshwar-7, Kathmandu',
  website: 'kathmandutextile.com'
};

const MONTH_TO_NUM = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };

async function getSlipData(empId, month, year) {
  const monthNum = MONTH_TO_NUM[month];
  if (!monthNum || !empId) return null;
  const emp = employees.find(e => e.id === empId);
  if (!emp) return null;
  const snap = await getDocs(collection(db, 'wageEntries'));
  const entries = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(w => {
    if (w.employeeId !== empId) return false;
    const d = w.date || '';
    const parts = d.split('-');
    if (parts.length < 2) return false;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    return y === parseInt(year, 10) && m === monthNum;
  });
  // Department-wise earnings (gross = qty*rate + ot*rate + bonus)
  const byDept = {};
  let totalDeductions = 0;
  for (const w of entries) {
    const qty = Number(w.qty) || 0;
    const rate = Number(w.rate) || 0;
    const ot = Number(w.ot) || 0;
    const bonus = Number(w.bonus) || 0;
    const deduct = Number(w.deduct) || 0;
    const gross = (qty * rate) + (ot * rate) + bonus;
    totalDeductions += deduct;
    const dept = w.department || 'Other';
    if (!byDept[dept]) byDept[dept] = 0;
    byDept[dept] += gross;
  }
  const deptEarnings = Object.entries(byDept).map(([department, amount]) => ({ department, amount }));
  const totalEarnings = deptEarnings.reduce((s, d) => s + d.amount, 0);
  const totalNet = totalEarnings - totalDeductions;
  const hasBank = !!(emp.bankName || emp.bankAccountNumber || emp.accountHolderName);
  const slipNo = `KTT-PS-${year}-${String(entries.length).padStart(3, '0')}`;
  return { emp, month, year, totalEarnings, totalDeductions, totalNet, deptEarnings, hasBank, entries, slipNo };
}

function getPayslipDate(month, year) {
  const m = MONTH_TO_NUM[month] || 1;
  const lastDay = new Date(parseInt(year, 10), m, 0).getDate();
  return `${String(lastDay).padStart(2, '0')}-${String(m).padStart(2, '0')}-${year}`;
}

function getPayPeriod(month, year) {
  const m = MONTH_TO_NUM[month] || 1;
  const y = parseInt(year, 10);
  const start = `01-${String(m).padStart(2, '0')}-${y}`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${String(lastDay).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
  return `${start} to ${end}`;
}

function renderPayslipPreview(data) {
  const container = document.getElementById('payslip-container');
  if (!container) return;
  if (!data) {
    container.innerHTML = '<p class="empty-msg">No wage data for selected period.</p>';
    return;
  }
  const { emp, month, year, totalEarnings, totalDeductions, totalNet, deptEarnings, hasBank, slipNo } = data;
  const payDate = getPayslipDate(month, year);
  const payPeriod = getPayPeriod(month, year);
  const paymentMethod = hasBank ? 'Bank' : 'Cash';
  const paymentDetail = hasBank
    ? `Bank: ${escapeHtml(emp.bankName || '—')}<br>Account No: ${escapeHtml(emp.bankAccountNumber || '—')}`
    : '—';
  let earningsRows = '';
  for (const { department, amount } of deptEarnings) {
    earningsRows += `<tr><td>${escapeHtml(department)}</td><td>${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`;
  }
  if (deptEarnings.length === 0) {
    earningsRows = '<tr><td>—</td><td>0.00</td></tr>';
  }
  container.innerHTML = `
    <div class="payslip-document" id="payslip-document">
      <div class="payslip-header-row">
        <div class="payslip-logo-placeholder">LOGO</div>
        <div class="payslip-company-block">
          <div class="payslip-company-name">${COMPANY.name}</div>
          <div class="payslip-company-address">${COMPANY.address}</div>
          <div class="payslip-company-contact">Phone: ${COMPANY.phone} &nbsp;|&nbsp; Email: ${COMPANY.email}</div>
          <div class="payslip-company-pan">${COMPANY.panVat}</div>
        </div>
        <div class="payslip-meta-block">
          <div class="payslip-meta-title">Payslip</div>
          <div class="payslip-meta-date">Date: ${payDate}</div>
          <div class="payslip-meta-slipno">Slip No: ${escapeHtml(slipNo)}</div>
        </div>
      </div>
      <div class="payslip-title">SALARY PAYSLIP</div>
      <div class="payslip-period">For the month of ${escapeHtml(month)} ${year}</div>
      <div class="payslip-details-row">
        <div class="payslip-employee-block">
          <table class="payslip-info-table">
            <tr><td>Name</td><td>${escapeHtml(emp.fullName || emp.name || '—')}</td></tr>
            <tr><td>Employee ID</td><td>${escapeHtml(emp.id || '—')}</td></tr>
            <tr><td>Department</td><td>${escapeHtml(emp.department || '—')}</td></tr>
            <tr><td>Designation</td><td>${escapeHtml(emp.position || '—')}</td></tr>
          </table>
        </div>
        <div class="payslip-payment-block">
          <table class="payslip-info-table">
            <tr><td>Pay Period</td><td>${payPeriod}</td></tr>
            <tr><td>Method of Payment</td><td><strong>${paymentMethod}</strong></td></tr>
            <tr><td></td><td>${paymentDetail}</td></tr>
          </table>
        </div>
      </div>
      <div class="payslip-earn-deduct-row">
        <div class="payslip-earnings">
          <h4>Earnings</h4>
          <table class="payslip-earn-table">
            <thead><tr><th>Description</th><th>Amount (Rs.)</th></tr></thead>
            <tbody>${earningsRows}</tbody>
          </table>
        </div>
        <div class="payslip-deductions">
          <h4>Deductions</h4>
          <table class="payslip-deduct-table">
            <thead><tr><th>Description</th><th>Amount (Rs.)</th></tr></thead>
            <tbody>
              <tr><td>Deductions</td><td>${Number(totalDeductions).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="payslip-summary">
        <div class="payslip-summary-row"><span>Total Earnings:</span><span>${Number(totalEarnings).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
        <div class="payslip-summary-row"><span>Total Deductions:</span><span>${Number(totalDeductions).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
        <div class="payslip-summary-row payslip-net"><span>Net Pay (Rs.):</span><span>${Number(totalNet).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
      </div>
      <div class="payslip-signature-row">
        <div class="payslip-sig-box"><div class="payslip-sig-line"></div><div class="payslip-sig-label">Authorised Signature</div></div>
        <div class="payslip-sig-box"><div class="payslip-sig-line"></div><div class="payslip-sig-label">Employee Signature</div></div>
      </div>
      <div class="payslip-disclaimer">Note: This is a system-generated payslip based on recorded production, fibre usage, and approved payroll data.</div>
    </div>`;
}

async function generatePayslipPDF(data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 14;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY.name, 14, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(COMPANY.address, 14, y); y += 4;
  doc.text(`Phone: ${COMPANY.phone} | Email: ${COMPANY.email}`, 14, y); y += 4;
  doc.text(COMPANY.panVat, 14, y); y += 6;

  doc.text('Payslip', pageW - 14, 14, { align: 'right' });
  doc.text(`Date: ${getPayslipDate(data.month, data.year)}`, pageW - 14, 19, { align: 'right' });
  doc.text(`Slip No: ${data.slipNo}`, pageW - 14, 24, { align: 'right' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('SALARY PAYSLIP', pageW / 2, 36, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`For the month of ${data.month} ${data.year}`, pageW / 2, 42, { align: 'center' });
  y = 50;

  const emp = data.emp;
  doc.text(`Name: ${emp.fullName || emp.name || '—'}`, 14, y); y += 5;
  doc.text(`Employee ID: ${emp.id || '—'}`, 14, y); y += 5;
  doc.text(`Department: ${emp.department || '—'}`, 14, y); y += 5;
  doc.text(`Designation: ${emp.position || '—'}`, 14, y); y += 5;
  doc.text(`Pay Period: ${getPayPeriod(data.month, data.year)}`, pageW / 2 + 10, 50);
  doc.text(`Method of Payment: ${data.hasBank ? 'Bank' : 'Cash'}`, pageW / 2 + 10, 55);
  if (data.hasBank) {
    doc.text(`Bank: ${emp.bankName || '—'} | A/C: ${emp.bankAccountNumber || '—'}`, pageW / 2 + 10, 60);
  }
  y += 10;

  const earnBody = data.deptEarnings.map(d => [d.department, Number(d.amount).toFixed(2)]);
  if (earnBody.length === 0) earnBody.push(['—', '0.00']);
  doc.autoTable({
    startY: y,
    head: [['Earnings - Description', 'Amount (Rs.)']],
    body: earnBody,
    theme: 'grid',
    margin: { left: 14 },
    styles: { fontSize: 8 }
  });
  y = doc.lastAutoTable.finalY + 4;
  doc.autoTable({
    startY: y,
    head: [['Deductions - Description', 'Amount (Rs.)']],
    body: [['Deductions', Number(data.totalDeductions).toFixed(2)]],
    theme: 'grid',
    margin: { left: 14 },
    styles: { fontSize: 8 }
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFont('helvetica', 'bold');
  doc.text(`Total Earnings: ${Number(data.totalEarnings).toFixed(2)}`, 14, y); y += 6;
  doc.text(`Total Deductions: ${Number(data.totalDeductions).toFixed(2)}`, 14, y); y += 6;
  doc.text(`Net Pay (Rs.): ${Number(data.totalNet).toFixed(2)}`, 14, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('_______________', 14, y);
  doc.text('Authorised Signature', 14, y + 5);
  doc.text('_______________', pageW / 2 + 20, y);
  doc.text('Employee Signature', pageW / 2 + 20, y + 5);
  y += 18;

  doc.setTextColor(100, 100, 100);
  doc.text('Note: This is a system-generated payslip based on recorded production, fibre usage, and approved payroll data.', 14, y, { maxWidth: pageW - 28 });
  return doc;
}

async function showSlipPreview() {
  const empId = selSlipEmployee?.value?.trim();
  const month = selSlipMonth?.value;
  const year = selSlipYear?.value || String(new Date().getFullYear());
  const slipSummary = document.getElementById('slip-summary');
  if (!empId || !month) { showToast('Select employee and month.', 'error'); return; }
  slipSummary.style.display = 'block';
  try {
    const data = await getSlipData(empId, month, year);
    renderPayslipPreview(data);
  } catch (err) {
    console.error(err);
    showToast('Failed to load payslip data.', 'error');
    const c = document.getElementById('payslip-container');
    if (c) c.innerHTML = '<p class="error">Failed to load data.</p>';
  }
}

async function downloadSlipPDF() {
  const empId = selSlipEmployee?.value?.trim();
  const month = selSlipMonth?.value;
  const year = selSlipYear?.value || String(new Date().getFullYear());
  if (!empId || !month) { showToast('Select employee and month.', 'error'); return; }
  try {
    const data = await getSlipData(empId, month, year);
    if (!data || data.entries.length === 0) { showToast('No wage data for selected period.', 'error'); return; }
    const doc = await generatePayslipPDF(data);
    const name = (data.emp.fullName || data.emp.name || 'Employee').replace(/\s+/g, '_');
    doc.save(`Payslip_${name}_${month}_${year}.pdf`);
    showToast('PDF downloaded.');
  } catch (err) {
    console.error(err);
    showToast('Failed to generate PDF.', 'error');
  }
}

// Wage delete modal
function openDeleteWageModal(btn) {
  deleteWageId = btn.dataset.id;
  const emp = btn.dataset.emp;
  const date = btn.dataset.date;
  const item = btn.dataset.item;
  const qty = btn.dataset.qty;
  const net = btn.dataset.net;
  if (deleteWageDetails) {
    deleteWageDetails.innerHTML = `
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;">
        <span style="color:#94a3b8;">Employee:</span><span style="color:#f0f4ff;font-weight:600;">${emp}</span>
        <span style="color:#94a3b8;">Date:</span><span style="color:#f0f4ff;">${date}</span>
        <span style="color:#94a3b8;">Item:</span><span style="color:#f0f4ff;">${item}</span>
        <span style="color:#94a3b8;">Qty:</span><span style="color:#f0f4ff;">${qty}</span>
        <span style="color:#94a3b8;">Net Wage:</span><span style="color:#f59e0b;font-weight:700;">Rs. ${Number(net).toLocaleString()}</span>
      </div>`;
  }
  if (deleteWageModal) deleteWageModal.style.display = 'flex';
}

function closeDeleteWageModal() {
  deleteWageId = null;
  if (deleteWageModal) deleteWageModal.style.display = 'none';
}

async function confirmDeleteWage() {
  if (!deleteWageId) return;
  const btn = btnConfirmWageDelete;
  const originalText = btn?.textContent;
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting...'; }
    await deleteDoc(doc(db, 'wageEntries', deleteWageId));
    showToast('Wage entry deleted successfully', 'success');
    closeDeleteWageModal();
    await loadWageEntries();
  } catch (err) {
    console.error('Failed to delete wage entry:', err);
    showToast('Failed to delete: ' + (err.message || err), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText || 'Delete'; }
  }
}

if (btnConfirmWageDelete) btnConfirmWageDelete.addEventListener('click', confirmDeleteWage);
if (btnCancelWageDelete) btnCancelWageDelete.addEventListener('click', closeDeleteWageModal);
if (modalCloseWageDelete) modalCloseWageDelete.addEventListener('click', closeDeleteWageModal);
if (deleteWageModal) {
  deleteWageModal.addEventListener('click', (e) => {
    if (e.target === deleteWageModal) closeDeleteWageModal();
  });
}

async function loadWageEntries() {
  if (!tblWageEntriesBody) return;
  try {
    const snap = await getDocs(collection(db, 'wageEntries'));
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    tblWageEntriesBody.innerHTML = '';
    if (!entries.length) {
      tblWageEntriesBody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:#94a3b8;padding:1.5rem;">No wage entries found.</td></tr>';
      return;
    }
    entries.forEach(w => {
      const empName = employees.find(e => e.id === w.employeeId)?.fullName || w.employeeName || w.employeeId || '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(w.date || '—')}</td><td>${escapeHtml(empName)}</td><td>${escapeHtml(w.employeeId || '—')}</td>
        <td>${escapeHtml(w.department || '—')}</td><td>${escapeHtml(w.item || '—')}</td><td>${w.qty || 0}</td>
        <td>${escapeHtml(w.unit || '—')}</td><td>${w.rate || 0}</td><td>${w.ot || 0}</td><td>${w.bonus || 0}</td>
        <td>${w.deduct || 0}</td><td><strong style="color:#f59e0b">Rs. ${(w.net || 0).toLocaleString()}</strong></td>
        <td><button class="btn-delete-wage" data-id="${w.id}" data-emp="${escapeHtml(empName)}" data-date="${escapeHtml(w.date || '—')}" data-item="${escapeHtml(w.item || '—')}" data-qty="${w.qty || 0}" data-net="${w.net || 0}" title="Delete">🗑️</button></td>`;
      tblWageEntriesBody.appendChild(tr);
    });
    tblWageEntriesBody.querySelectorAll('.btn-delete-wage').forEach(btn => {
      btn.addEventListener('click', () => openDeleteWageModal(btn));
    });
  } catch (err) {
    console.error('Failed to load wage entries:', err);
    tblWageEntriesBody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:#ef4444;">Failed to load wage entries.</td></tr>';
  }
}

if (btnPreviewSlip) btnPreviewSlip.addEventListener('click', showSlipPreview);
if (btnDownloadSlip) btnDownloadSlip.addEventListener('click', downloadSlipPDF);
if (btnShareSlip) {
  btnShareSlip.addEventListener('click', () => {
    if (!selSlipEmployee?.value || !selSlipMonth?.value) {
      showToast('Generate payslip first (Preview), then Share.', 'error');
      return;
    }
    document.getElementById('share-modal')?.style?.setProperty('display', 'flex');
  });
}

// init
(async function(){
  await Promise.all([loadEmployees(), loadRates(), loadManagerUserNameMap()]);
  // set default date
  if (inpDate) inpDate.valueAsDate = new Date();
  // Load wage entries table
  loadWageEntries();
})();
