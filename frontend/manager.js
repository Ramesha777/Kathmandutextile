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
        <thead><tr><th>Barcode/ID</th><th>Product</th><th>Qty</th><th>Unit</th><th>Explanation</th><th>Reported at</th></tr></thead>
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
        </tr>`;
    }
    html += '</tbody></table>';
    managerDamageReportsListEl.innerHTML = html;
  } catch (err) {
    managerDamageReportsListEl.innerHTML = '<p class="error">Failed to load reports: ' + escapeHtml(err.message || err) + '</p>';
  }
}

// Load manager orders with approve/reject
const managerOrdersListEl = document.getElementById('managerOrdersList');
const orderSearchQueryEl = document.getElementById('orderSearchQuery');
const orderStatusFilterEl = document.getElementById('orderStatusFilter');

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
        (o.supplierContact || '').toLowerCase().includes(search) ||
        (o.supplierName || '').toLowerCase().includes(search)
      );
    }
    if (statusFilter) {
      items = items.filter(o => (o.status || '').toLowerCase() === statusFilter.toLowerCase());
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
      const createdAt = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : '—';
      const deliveryDate = o.deliveryDate || '—';
      const status = (o.status || 'pending').toLowerCase();
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
            ${status === 'pending' ? `
              <button type="button" class="btn btn-sm btn-primary btn-order-approve" data-id="${o.id}">Approve</button>
              <button type="button" class="btn btn-sm btn-danger btn-order-reject" data-id="${o.id}">Reject</button>
            ` : '—'}
          </td>
        </tr>`;
    }
    html += '</tbody></table>';
    managerOrdersListEl.innerHTML = html;

    managerOrdersListEl.querySelectorAll('.btn-order-approve').forEach(btn => {
      btn.addEventListener('click', () => updateOrderStatus(btn.dataset.id, 'approved'));
    });
    managerOrdersListEl.querySelectorAll('.btn-order-reject').forEach(btn => {
      btn.addEventListener('click', () => updateOrderStatus(btn.dataset.id, 'rejected'));
    });
  } catch (err) {
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

// Wage form handlers
if (selDept) selDept.addEventListener('change', populateWageItemSelect);
if (selItem) selItem.addEventListener('change', onWageItemChange);
if (inpEmployee) inpEmployee.addEventListener('input', onWageEmployeeInput);
if (inpEmployee) inpEmployee.addEventListener('blur', onWageEmployeeInput);

if (btnSave) {
  btnSave.addEventListener('click', async () => {
    const empId = inpEmployeeId?.value?.trim();
    const empName = employees.find(e => e.id === empId)?.fullName || inpEmployee?.value?.trim();
    const date = inpDate?.value?.trim();
    const dept = selDept?.value?.trim();
    const item = selItem?.value?.trim();
    const qty = Number(inpQty?.value) || 0;
    const unit = inpUnit?.value || 'piece';
    const rate = Number(inpRate?.value) || 0;
    const ot = Number(inpOT?.value) || 0;
    const bonus = Number(inpBonus?.value) || 0;
    const deduct = Number(inpDeduct?.value) || 0;

    if (!empId || !empName || !date || !dept || !item) {
      showToast('Please fill Employee, Date, Department, and Item.', 'error');
      return;
    }
    const base = (qty * rate) + (ot * (rate || 0)) + bonus - deduct;
    const net = Math.max(0, base);

    try {
      btnSave.disabled = true;
      btnSave.textContent = 'Saving…';
      await addDoc(collection(db, 'wageEntries'), {
        employeeId: empId,
        employeeName: empName,
        date,
        department: dept,
        item,
        qty,
        unit,
        rate,
        ot,
        bonus,
        deduct,
        net,
        createdAt: serverTimestamp()
      });
      showToast('Wage entry saved.');
      if (btnClear) btnClear.click();
      await loadWageEntries();
    } catch (err) {
      showToast('Failed to save: ' + (err.message || err), 'error');
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = 'Save Entry';
    }
  });
}

if (btnClear) {
  btnClear.addEventListener('click', () => {
    if (inpEmployee) inpEmployee.value = '';
    if (inpEmployeeId) inpEmployeeId.value = '';
    if (inpDate) inpDate.valueAsDate = new Date();
    if (inpQty) inpQty.value = '';
    if (inpRate) inpRate.value = '';
    if (inpOT) inpOT.value = '0';
    if (inpBonus) inpBonus.value = '0';
    if (inpDeduct) inpDeduct.value = '0';
    if (selItem) selItem.selectedIndex = 0;
    onWageItemChange();
  });
}

if (managerInventoryCategoryFilterEl) {
  managerInventoryCategoryFilterEl.addEventListener('change', () => {
    if (managerInventoryItems.length) renderManagerInventory();
  });
}

if (orderSearchQueryEl) orderSearchQueryEl.addEventListener('input', () => loadManagerOrders());
if (orderSearchQueryEl) orderSearchQueryEl.addEventListener('change', () => loadManagerOrders());
if (orderStatusFilterEl) orderStatusFilterEl.addEventListener('change', () => loadManagerOrders());

// ── Delete wage entry state ──
let deleteWageId = null;
const deleteWageModal = document.getElementById('delete-wage-modal');
const deleteWageDetails = document.getElementById('delete-wage-details');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const modalCloseDelete = document.getElementById('modal-close-delete');

// ── Load and display wage entries — UPDATED with delete button ──
async function loadWageEntries() {
  try {
    const snap = await getDocs(collection(db, "wageEntries"));
    const entries = [];
    snap.forEach(d => entries.push({ id: d.id, ...d.data() }));

    // Sort by date descending
    entries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    tblWageEntriesBody.innerHTML = "";

    if (!entries.length) {
      tblWageEntriesBody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:#94a3b8;padding:1.5rem;">No wage entries found.</td></tr>';
      return;
    }

    entries.forEach(w => {
      const empName = employees.find(e => e.id === w.employeeId)?.fullName || w.employeeName || w.employeeId || "—";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(w.date || "—")}</td>
        <td>${escapeHtml(empName)}</td>
        <td>${escapeHtml(w.employeeId || "—")}</td>
        <td>${escapeHtml(w.department || "—")}</td>
        <td>${escapeHtml(w.item || "—")}</td>
        <td>${w.qty || 0}</td>
        <td>${escapeHtml(w.unit || "—")}</td>
        <td>${w.rate || 0}</td>
        <td>${w.ot || 0}</td>
        <td>${w.bonus || 0}</td>
        <td>${w.deduct || 0}</td>
        <td><strong style="color:#f59e0b">Rs. ${(w.net || 0).toLocaleString()}</strong></td>
        <td>
          <button class="btn-delete-wage" 
                  data-id="${w.id}" 
                  data-emp="${escapeHtml(empName)}" 
                  data-date="${escapeHtml(w.date || '—')}" 
                  data-item="${escapeHtml(w.item || '—')}" 
                  data-qty="${w.qty || 0}" 
                  data-net="${w.net || 0}"
                  title="Delete this entry">
            🗑️
          </button>
        </td>
      `;
      tblWageEntriesBody.appendChild(tr);
    });

    // Attach delete click listeners to all delete buttons
    document.querySelectorAll('.btn-delete-wage').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(btn));
    });

  } catch (err) {
    console.error("Failed to load wage entries:", err);
    tblWageEntriesBody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:#ef4444;padding:1rem;">Failed to load wage entries.</td></tr>';
  }
}

// ── Open delete confirmation modal ──
function openDeleteModal(btn) {
  deleteWageId = btn.dataset.id;
  const emp  = btn.dataset.emp;
  const date = btn.dataset.date;
  const item = btn.dataset.item;
  const qty  = btn.dataset.qty;
  const net  = btn.dataset.net;

  if (deleteWageDetails) {
    deleteWageDetails.innerHTML = `
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;">
        <span style="color:#94a3b8;">Employee:</span><span style="color:#f0f4ff;font-weight:600;">${emp}</span>
        <span style="color:#94a3b8;">Date:</span><span style="color:#f0f4ff;">${date}</span>
        <span style="color:#94a3b8;">Item:</span><span style="color:#f0f4ff;">${item}</span>
        <span style="color:#94a3b8;">Qty:</span><span style="color:#f0f4ff;">${qty}</span>
        <span style="color:#94a3b8;">Net Wage:</span><span style="color:#f59e0b;font-weight:700;">Rs. ${Number(net).toLocaleString()}</span>
      </div>
    `;
  }

  if (deleteWageModal) deleteWageModal.style.display = 'flex';
}

// ── Close delete modal ──
function closeDeleteModal() {
  deleteWageId = null;
  if (deleteWageModal) deleteWageModal.style.display = 'none';
}

// ── Confirm delete ──
async function confirmDeleteWage() {
  if (!deleteWageId) return;

  const btn = btnConfirmDelete;
  const originalText = btn.textContent;

  try {
    // Disable button and show loading
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    btn.style.opacity = '0.6';

    await deleteDoc(doc(db, "wageEntries", deleteWageId));

    showToast('Wage entry deleted successfully', 'success');
    closeDeleteModal();

    // Reload the table
    await loadWageEntries();

  } catch (err) {
    console.error("Failed to delete wage entry:", err);
    showToast('Failed to delete: ' + (err.message || err), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    btn.style.opacity = '1';
  }
}

// ── Delete modal event listeners ──
if (btnConfirmDelete) {
  btnConfirmDelete.addEventListener('click', confirmDeleteWage);
}

if (btnCancelDelete) {
  btnCancelDelete.addEventListener('click', closeDeleteModal);
}

if (modalCloseDelete) {
  modalCloseDelete.addEventListener('click', closeDeleteModal);
}

if (deleteWageModal) {
  deleteWageModal.addEventListener('click', (e) => {
    if (e.target === deleteWageModal) closeDeleteModal();
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
