// manager.js
import { loadHolidayPanel } from "./manageholiday.js";
import { loadPunchRecords, renderPunchRecords } from "./punchrecords.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  addDoc,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  query,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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
const inpTax = document.getElementById('wage-tax');
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
let lastPayslipShareData = null; // { url, emp, month, year } for SMS/WhatsApp/Mail
let lastInvoiceShareData = null;  // { url, order } for invoice share
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

let deleteInventoryId = null;
const deleteInventoryModal = document.getElementById('delete-inventory-modal');
const deleteInventoryDetails = document.getElementById('delete-inventory-details');
const btnConfirmInventoryDelete = document.getElementById('btn-confirm-inventory-delete');
const btnCancelInventoryDelete = document.getElementById('btn-cancel-inventory-delete');
const modalCloseInventoryDelete = document.getElementById('modal-close-inventory-delete');

let managerInventoryItems = [];
let managerUserNameByUid = {};
let allWageEntries = [];

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
    if (section === 'holiday') {
      loadHolidayPanel();
    }
    if (section === 'punch-records') {
      loadPunchRecords(db);
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
    opt.textContent = it.name;
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

// Wage form: department change loads work items; item change auto-fills rate
if (selDept) selDept.addEventListener('change', populateWageItemSelect);
if (selItem) selItem.addEventListener('change', onWageItemChange);
if (inpEmployee) inpEmployee.addEventListener('input', onWageEmployeeInput);

// Check if employee is on holiday on given date (YYYY-MM-DD)
async function isEmployeeOnHolidayOnDate(empId, dateStr, holidaysCache) {
  let holidays = holidaysCache;
  if (!holidays) {
    const snap = await getDocs(collection(db, 'holidays'));
    holidays = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const empHolidays = holidays.filter(h => {
    if (h.employeeId !== empId) return false;
    const st = (h.status || "approved").toLowerCase();
    return st === "approved";
  });
  for (const h of empHolidays) {
    const from = (h.dateFrom || '').trim();
    const to = (h.dateTo || '').trim();
    if (from && to && dateStr >= from && dateStr <= to) return true;
  }
  return false;
}

// Save wage entry
async function saveWageEntry() {
  const empId = inpEmployeeId?.value?.trim();
  const dateVal = inpDate?.value?.trim();
  if (!empId || !dateVal) {
    showToast('Please select employee and date.', 'error');
    return;
  }
  const isOnHoliday = await isEmployeeOnHolidayOnDate(empId, dateVal);
  if (isOnHoliday) {
    const emp = employees.find(e => e.id === empId);
    const name = emp ? (emp.fullName || emp.name || emp.id) : empId;
    showToast(`${name} is on holiday on ${dateVal}. Cannot enter wages.`, 'error');
    return;
  }
  const emp = employees.find(e => e.id === empId);
  const employeeName = emp ? (emp.fullName || emp.name || emp.id) : empId;
  const department = selDept?.value?.trim() || '';
  const item = selItem?.value?.trim() || '';
  const qty = Number(inpQty?.value) || 0;
  const unit = inpUnit?.value?.trim() || 'piece';
  const rate = Number(inpRate?.value) || 0;
  const ot = Number(inpOT?.value) || 0;
  const bonus = Number(inpBonus?.value) || 0;
  const deduct = Number(inpDeduct?.value) || 0;
  const tax = Number(inpTax?.value) || 0;
  const net = (qty * rate) + (ot * rate) + bonus - deduct - tax;
  if (!department || !item) {
    showToast('Please select department and item.', 'error');
    return;
  }
  const originalText = btnSave?.textContent;
  if (btnSave) { btnSave.disabled = true; btnSave.textContent = 'Saving...'; }
  try {
    await addDoc(collection(db, 'wageEntries'), {
      employeeId: empId, employeeName, date: dateVal, department, item,
      qty, unit, rate, ot, bonus, deduct, tax, net
    });
    showToast('Wage entry saved.', 'success');
    loadWageEntries();
    if (btnClear) btnClear.click();
  } catch (err) {
    console.error('Save wage failed:', err);
    showToast('Failed to save: ' + (err.message || err), 'error');
  } finally {
    if (btnSave) { btnSave.disabled = false; btnSave.textContent = originalText || 'Save Entry'; }
  }
}

function clearWageForm() {
  if (inpEmployee) inpEmployee.value = '';
  if (inpEmployeeId) inpEmployeeId.value = '';
  if (inpDate) inpDate.valueAsDate = new Date();
  if (selDept) selDept.value = '';
  populateWageItemSelect();
  if (inpQty) inpQty.value = '';
  if (inpUnit) inpUnit.value = 'piece';
  if (inpRate) inpRate.value = '';
  if (inpOT) inpOT.value = '0';
  if (inpBonus) inpBonus.value = '0';
  if (inpDeduct) inpDeduct.value = '0';
  if (inpTax) inpTax.value = '0';
}

if (btnSave) btnSave.addEventListener('click', saveWageEntry);
if (btnClear) btnClear.addEventListener('click', clearWageForm);

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

// ── Inventory delete functions ──
function openInventoryDeleteModal(btn) {
  deleteInventoryId = btn.dataset.id;
  const name = btn.dataset.name;
  const barcode = btn.dataset.barcode;
  const qty = btn.dataset.qty;
  const category = btn.dataset.category;

  if (deleteInventoryDetails) {
    deleteInventoryDetails.innerHTML = `
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;">
        <span style="color:#94a3b8;">Name:</span><span style="color:#f0f4ff;font-weight:600;">${name}</span>
        <span style="color:#94a3b8;">Barcode:</span><span style="color:#f0f4ff;">${barcode}</span>
        <span style="color:#94a3b8;">Category:</span><span style="color:#f0f4ff;">${category}</span>
        <span style="color:#94a3b8;">Qty:</span><span style="color:#f0f4ff;">${qty}</span>
      </div>`;
  }

  if (deleteInventoryModal) deleteInventoryModal.style.display = 'flex';
}

function closeInventoryDeleteModal() {
  deleteInventoryId = null;
  if (deleteInventoryModal) deleteInventoryModal.style.display = 'none';
}

async function confirmDeleteInventory() {
  if (!deleteInventoryId) return;

  const btn = btnConfirmInventoryDelete;
  const originalText = btn.textContent;

  try {
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    btn.style.opacity = '0.6';

    await deleteDoc(doc(db, 'inventory', deleteInventoryId));

    showToast('Inventory item deleted successfully', 'success');
    closeInventoryDeleteModal();
    
    // Reload inventory
    await loadManagerInventory();

  } catch (err) {
    console.error('Failed to delete inventory:', err);
    showToast('Failed to delete: ' + (err.message || err), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    btn.style.opacity = '1';
  }
}

// ── Inventory delete modal event listeners ──
if (btnConfirmInventoryDelete) {
  btnConfirmInventoryDelete.addEventListener('click', confirmDeleteInventory);
}
if (btnCancelInventoryDelete) {
  btnCancelInventoryDelete.addEventListener('click', closeInventoryDeleteModal);
}
if (modalCloseInventoryDelete) {
  modalCloseInventoryDelete.addEventListener('click', closeInventoryDeleteModal);
}
if (deleteInventoryModal) {
  deleteInventoryModal.addEventListener('click', (e) => {
    if (e.target === deleteInventoryModal) closeInventoryDeleteModal();
  });
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

    if (managerInventoryCategoryFilterEl) {
      managerInventoryCategoryFilterEl.addEventListener('change', renderManagerInventory);
    }

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
      <thead><tr><th>Barcode/ID</th><th>Name</th><th>Category</th><th>Qty</th><th>Unit</th><th>Vendor</th><th>Storage</th><th>Actions</th></tr></thead>
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
        <td>
          <button type="button" class="btn-delete-inventory btn btn-sm btn-danger" 
                  data-id="${x.id}" 
                  data-name="${escapeHtml(x.name || '—')}"
                  data-barcode="${escapeHtml(x.barcode || '—')}"
                  data-qty="${escapeHtml(x.quantity != null ? x.quantity : '—')}"
                  data-category="${escapeHtml(x.category || '—')}"
                  title="Delete inventory item">
            🗑️
          </button>
        </td>
      </tr>`;
  }
  html += '</tbody></table>';
  managerInventoryListEl.innerHTML = html;
  
  // Attach delete listeners
  managerInventoryListEl.querySelectorAll('.btn-delete-inventory').forEach(btn => {
    btn.addEventListener('click', () => openInventoryDeleteModal(btn));
  });
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
        <thead><tr><th>Barcode/ID</th><th>Product</th><th>Qty</th><th>Unit</th><th>Explanation</th><th>Images</th><th>Reported at</th><th>Action</th></tr></thead>
        <tbody>`;
    for (const x of items) {
      let reportedAt = '—';
      if (x.reportedAt?.toDate) {
        try { reportedAt = x.reportedAt.toDate().toLocaleString(); } catch (_) {}
      }
      const urls = Array.isArray(x.imageUrls) ? x.imageUrls : [];
      const imagesHtml = urls.length
        ? urls.map((u, i) => `<a href="${u}" target="_blank" rel="noopener" title="View image ${i + 1}"><img src="${u}" alt="Damage ${i + 1}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.1);margin-right:4px;vertical-align:middle;"></a>`).join("")
        : "—";
      html += `
        <tr>
          <td>${escapeHtml(x.barcode)}</td>
          <td>${escapeHtml(x.name)}</td>
          <td>${escapeHtml(x.quantity != null ? x.quantity : '—')}</td>
          <td>${escapeHtml(x.unit || x.units || '—')}</td>
          <td>${escapeHtml(x.explanation)}</td>
          <td>${imagesHtml}</td>
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

function normalizeForMatch(s) {
  return (String(s || '')).trim().toLowerCase();
}

// Load manager orders with approve/reject
async function loadManagerOrders() {
  if (!managerOrdersListEl) return;
  managerOrdersListEl.innerHTML = '<p class="loading-msg">Loading orders…</p>';
  try {
    const snap = await getDocs(collection(db, 'orders'));
    let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

    // Load selling rates for price display
    const ratesSnap = await getDocs(collection(db, 'rates_selling'));
    const ratesMap = {};
    ratesSnap.docs.forEach(d => {
      const r = d.data();
      const name = r.productName || r.name || '';
      const unit = r.unit || '';
      if (name) {
        // Store by name only AND by name+unit for flexible matching
        const keyNameOnly = normalizeForMatch(name);
        const keyFull = normalizeForMatch(name) + '||' + normalizeForMatch(unit);
        ratesMap[keyFull] = Number(r.sellingPrice ?? r.rate ?? 0);
        // Also store by name only (fallback)
        if (!ratesMap[keyNameOnly]) ratesMap[keyNameOnly] = Number(r.sellingPrice ?? r.rate ?? 0);
      }
    });

    const search = (orderSearchQueryEl?.value || '').toLowerCase().trim();
    const statusFilter = orderStatusFilterEl?.value || '';
    if (search) {
      items = items.filter(o =>
        (String(o.supplierContact || '')).toLowerCase().includes(search) ||
        (String(o.supplierName || '')).toLowerCase().includes(search) ||
        (String(o.productName || '')).toLowerCase().includes(search)
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
        <thead><tr><th>Products</th><th>Supplier</th><th>Contact</th><th>Address</th><th>Delivery</th><th>Est. Total</th><th>Notes</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>`;
    for (const o of items) {
      const deliveryDate = o.deliveryDate || '—';
      const status = (o.status || 'pending').toLowerCase();

      // ── Build products cell: support both multi-product array and legacy single-product ──
      let productsArray = [];
      if (Array.isArray(o.products) && o.products.length > 0) {
        productsArray = o.products;
      } else if (o.productName) {
        productsArray = [{
          productName: o.productName,
          productBarcode: o.productBarcode || '—',
          quantity: o.quantity,
          unit: o.unit
        }];
      }

      // Calculate total from selling rates
      let orderTotal = 0;
      const productLines = [];
      for (const p of productsArray) {
        const name = p.productName || p.name || '—';
        const unit = p.unit || '—';
        const qty = Number(p.quantity) || 0;
        const keyFull = normalizeForMatch(name) + '||' + normalizeForMatch(unit);
        const keyName = normalizeForMatch(name);
        const rate = ratesMap[keyFull] ?? ratesMap[keyName] ?? 0;
        const lineTotal = qty * rate;
        orderTotal += lineTotal;
        productLines.push({ name, qty, unit, rate, lineTotal });
      }

      const productsCellHtml = productsArray.length === 0
        ? '<span style="color:#64748b;">0</span>'
        : `<span style="font-weight:500;color:#f0f4ff;">${productsArray.length}</span>`;

      // Estimated total cell
      const totalCellHtml = orderTotal > 0
        ? `<span style="color:#f59e0b;font-weight:700;font-size:0.95rem;">Rs. ${orderTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>`
        : `<span style="color:#ef4444;font-size:0.8rem;" title="No selling rates found for these products">⚠️ No rates</span>`;

      const productSummary = productsArray.map(p => `${p.productName || '—'} (×${p.quantity ?? '?'})`).join(', ');

      html += `
        <tr>
          <td>${productsCellHtml}</td>
          <td>${escapeHtml(o.supplierName || '—')}</td>
          <td>${escapeHtml(o.supplierContact || '—')}</td>
          <td>${escapeHtml(o.supplierAddress || o.deliveryAddress || '—')}</td>
          <td>${escapeHtml(deliveryDate)}</td>
          <td>${totalCellHtml}</td>
          <td style="max-width:180px;font-size:0.82rem;color:#94a3b8;">${escapeHtml(o.notes || '—')}</td>
          <td><span class="status-badge status-${status}">${escapeHtml(status)}</span></td>
          <td style="white-space:nowrap;">
            <div class="order-actions-dropdown" 
                 data-id="${o.id}" 
                 data-product="${escapeHtml(productSummary)}"
                 data-supplier="${escapeHtml(o.supplierName || '—')}"
                 data-qty="${productsArray.length} product(s)"
                 data-status="${status}">
              <button type="button" class="btn btn-sm btn-outline order-actions-trigger" title="Actions">Actions ▼</button>
              <div class="order-actions-menu">
                <button type="button" class="order-action-item" data-action="approved">Approved</button>
                <button type="button" class="order-action-item" data-action="pending">Pending</button>
                <button type="button" class="order-action-item" data-action="rejected">Rejected</button>
                <hr class="order-action-divider">
                <button type="button" class="order-action-item" data-action="preview-invoice">👁️ Preview Invoice</button>
                <button type="button" class="order-action-item" data-action="print-invoice">🖨️ Print Invoice</button>
                <hr class="order-action-divider">
                <button type="button" class="order-action-item order-action-delete" data-action="delete">🗑️ Delete</button>
              </div>
            </div>
          </td>
        </tr>`;
    }
    html += '</tbody></table>';
    managerOrdersListEl.innerHTML = html;

    // Order actions dropdown: toggle + action handlers
    managerOrdersListEl.querySelectorAll('.order-actions-trigger').forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = trigger.closest('.order-actions-dropdown');
        const menu = dropdown?.querySelector('.order-actions-menu');
        document.querySelectorAll('.order-actions-menu.show').forEach(m => m.classList.remove('show'));
        if (menu) menu.classList.toggle('show');
      });
    });

    managerOrdersListEl.querySelectorAll('.order-action-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = item.closest('.order-actions-dropdown');
        const menu = dropdown?.querySelector('.order-actions-menu');
        if (menu) menu.classList.remove('show');
        const action = item.dataset.action;
        const orderId = dropdown?.dataset?.id;
        if (!orderId) return;
        if (action === 'delete') {
          openOrderDeleteModal(dropdown);
        } else if (action === 'print-invoice') {
          openInvoiceSignatureModal(orderId, 'download');
        } else if (action === 'preview-invoice') {
          openInvoiceSignatureModal(orderId, 'preview');
        } else {
          updateOrderStatus(orderId, action);
        }
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

// ── Order Invoice PDF ──
let pendingInvoiceOrderId = null;
let pendingInvoiceMode = 'download'; // 'download' or 'preview'
const invoiceSignatureModal = document.getElementById('invoice-signature-modal');
const invoiceAuthorisedSignatureInput = document.getElementById('invoice-authorised-signature');
const invoicePreviewModal = document.getElementById('invoice-preview-modal');
const invoicePreviewBody = document.getElementById('invoice-preview-body');

function openInvoiceSignatureModal(orderId, mode = 'download') {
  pendingInvoiceOrderId = orderId;
  pendingInvoiceMode = mode;
  if (invoiceAuthorisedSignatureInput) invoiceAuthorisedSignatureInput.value = '';
  if (invoiceSignatureModal) invoiceSignatureModal.style.display = 'flex';
  invoiceAuthorisedSignatureInput?.focus();
}

function closeInvoiceSignatureModal() {
  pendingInvoiceOrderId = null;
  const linkResult = document.getElementById('invoice-link-result');
  if (linkResult) linkResult.style.display = 'none';
  if (invoiceSignatureModal) invoiceSignatureModal.style.display = 'none';
}

function getInvoiceOptions() {
  const sig = (invoiceAuthorisedSignatureInput?.value || '').trim() || 'Authorised';
  return { sig, discountPercent: 0, vatPercent: 0 };
}

function getPreviewDiscountVatOpts() {
  const discountEl = document.getElementById('preview-discount-toggle');
  const vatEl = document.getElementById('preview-vat-toggle');
  const discountPercent = discountEl?.checked ? (parseFloat(document.getElementById('preview-discount-percent')?.value) || 0) : 0;
  const vatPercent = vatEl?.checked ? (parseFloat(document.getElementById('preview-vat-percent')?.value) || 0) : 0;
  const sig = (invoiceAuthorisedSignatureInput?.value || '').trim() || 'Authorised';
  return { sig, discountPercent, vatPercent };
}

function initInvoiceSignatureModal() {
  document.getElementById('invoice-signature-modal-close')?.addEventListener('click', closeInvoiceSignatureModal);
  document.getElementById('invoice-signature-modal-cancel')?.addEventListener('click', closeInvoiceSignatureModal);

  document.getElementById('invoice-signature-modal-preview')?.addEventListener('click', async () => {
    const opts = getInvoiceOptions();
    const orderId = pendingInvoiceOrderId;
    closeInvoiceSignatureModal();
    if (orderId) await previewOrderInvoice(orderId, opts);
  });

  document.getElementById('invoice-signature-modal-generate')?.addEventListener('click', async () => {
    const opts = getInvoiceOptions();
    const orderId = pendingInvoiceOrderId;
    closeInvoiceSignatureModal();
    if (orderId) await printOrderInvoice(orderId, opts);
  });

  document.getElementById('invoice-signature-modal-getlink')?.addEventListener('click', async () => {
    const opts = getInvoiceOptions();
    const orderId = pendingInvoiceOrderId;
    if (!orderId) return;
    const btn = document.getElementById('invoice-signature-modal-getlink');
    const resultDiv = document.getElementById('invoice-link-result');
    const urlInput = document.getElementById('invoice-download-url');
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
      if (resultDiv) resultDiv.style.display = 'none';
      showToast('Uploading invoice…', 'info');
      const result = await getInvoiceDownloadLink(orderId, opts);
      const url = result?.url;
      if (url && urlInput) urlInput.value = url;
      if (resultDiv) resultDiv.style.display = 'block';
      lastInvoiceShareData = result ? { url, order: result.order } : null;
      showToast('Link ready. Copy and send to customer.', 'success');
    } catch (err) {
      console.error('Get invoice link failed:', err);
      showToast('Failed: ' + (err.message || ''), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔗 Get Download Link'; }
    }
  });

  document.getElementById('btn-copy-invoice-url')?.addEventListener('click', () => {
    const inp = document.getElementById('invoice-download-url');
    if (inp?.value) { navigator.clipboard.writeText(inp.value); showToast('URL copied.', 'success'); }
  });

  // Invoice (signature modal): SMS, WhatsApp, Mail
  document.getElementById('btn-invoice-sms')?.addEventListener('click', () => {
    const url = document.getElementById('invoice-download-url')?.value || lastInvoiceShareData?.url;
    const { phone } = lastInvoiceShareData?.order ? parseSupplierContact(lastInvoiceShareData.order.supplierContact) : {};
    openSms(url, 'Your invoice: ', phone);
  });
  document.getElementById('btn-invoice-whatsapp')?.addEventListener('click', () => {
    const url = document.getElementById('invoice-download-url')?.value || lastInvoiceShareData?.url;
    const { phone } = lastInvoiceShareData?.order ? parseSupplierContact(lastInvoiceShareData.order.supplierContact) : {};
    openWhatsApp(url, 'Your invoice: ', phone);
  });
  document.getElementById('btn-invoice-mail')?.addEventListener('click', () => {
    const url = document.getElementById('invoice-download-url')?.value || lastInvoiceShareData?.url;
    const { email } = lastInvoiceShareData?.order ? parseSupplierContact(lastInvoiceShareData.order.supplierContact) : {};
    openMail(url, 'Your Invoice', 'Your invoice download link: ', email);
  });

  invoiceSignatureModal?.addEventListener('click', (e) => {
    if (e.target === invoiceSignatureModal) closeInvoiceSignatureModal();
  });

  // Preview modal close
  const hidePreviewLinkResult = () => {
    const r = document.getElementById('invoice-preview-link-result');
    if (r) r.style.display = 'none';
  };
  document.getElementById('invoice-preview-modal-close')?.addEventListener('click', () => {
    hidePreviewLinkResult();
    if (invoicePreviewModal) invoicePreviewModal.style.display = 'none';
  });
  document.getElementById('invoice-preview-close-btn')?.addEventListener('click', () => {
    hidePreviewLinkResult();
    if (invoicePreviewModal) invoicePreviewModal.style.display = 'none';
  });
  invoicePreviewModal?.addEventListener('click', (e) => {
    if (e.target === invoicePreviewModal) {
      hidePreviewLinkResult();
      invoicePreviewModal.style.display = 'none';
    }
  });

  // Preview: Discount/VAT toggles
  document.getElementById('preview-discount-toggle')?.addEventListener('change', () => {
    const f = document.getElementById('preview-discount-field');
    if (f) f.style.display = document.getElementById('preview-discount-toggle')?.checked ? 'block' : 'none';
  });
  document.getElementById('preview-vat-toggle')?.addEventListener('change', () => {
    const f = document.getElementById('preview-vat-field');
    if (f) f.style.display = document.getElementById('preview-vat-toggle')?.checked ? 'block' : 'none';
  });
  document.getElementById('preview-apply-btn')?.addEventListener('click', () => {
    if (lastPreviewOrderId) applyPreviewDiscountVat();
  });
  document.getElementById('invoice-preview-download-btn')?.addEventListener('click', async () => {
    if (lastPreviewOrderId) await printOrderInvoice(lastPreviewOrderId, getPreviewDiscountVatOpts());
  });

  document.getElementById('invoice-preview-getlink-btn')?.addEventListener('click', async () => {
    if (!lastPreviewOrderId) return;
    const btn = document.getElementById('invoice-preview-getlink-btn');
    const resultDiv = document.getElementById('invoice-preview-link-result');
    const urlInput = document.getElementById('invoice-preview-download-url');
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
      if (resultDiv) resultDiv.style.display = 'none';
      showToast('Uploading invoice…', 'info');
      const opts = getPreviewDiscountVatOpts();
      const result = await getInvoiceDownloadLink(lastPreviewOrderId, opts);
      const url = result?.url;
      if (url && urlInput) urlInput.value = url;
      if (resultDiv) resultDiv.style.display = 'block';
      lastInvoiceShareData = result ? { url, order: result.order } : null;
      showToast('Link ready. Copy and send to customer.', 'success');
    } catch (err) {
      console.error('Get invoice link failed:', err);
      showToast('Failed: ' + (err.message || ''), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔗 Get Download Link'; }
    }
  });

  document.getElementById('btn-copy-invoice-preview-url')?.addEventListener('click', () => {
    const inp = document.getElementById('invoice-preview-download-url');
    if (inp?.value) { navigator.clipboard.writeText(inp.value); showToast('URL copied.', 'success'); }
  });

  // Invoice (preview modal): SMS, WhatsApp, Mail
  document.getElementById('btn-invoice-preview-sms')?.addEventListener('click', () => {
    const url = document.getElementById('invoice-preview-download-url')?.value || lastInvoiceShareData?.url;
    const { phone } = lastInvoiceShareData?.order ? parseSupplierContact(lastInvoiceShareData.order.supplierContact) : {};
    openSms(url, 'Your invoice: ', phone);
  });
  document.getElementById('btn-invoice-preview-whatsapp')?.addEventListener('click', () => {
    const url = document.getElementById('invoice-preview-download-url')?.value || lastInvoiceShareData?.url;
    const { phone } = lastInvoiceShareData?.order ? parseSupplierContact(lastInvoiceShareData.order.supplierContact) : {};
    openWhatsApp(url, 'Your invoice: ', phone);
  });
  document.getElementById('btn-invoice-preview-mail')?.addEventListener('click', () => {
    const url = document.getElementById('invoice-preview-download-url')?.value || lastInvoiceShareData?.url;
    const { email } = lastInvoiceShareData?.order ? parseSupplierContact(lastInvoiceShareData.order.supplierContact) : {};
    openMail(url, 'Your Invoice', 'Your invoice download link: ', email);
  });
}

let lastPreviewOrderId = null;

async function getInvoiceData(orderId, opts = {}) {
  const orderSnap = await getDoc(doc(db, 'orders', orderId));
  const order = orderSnap.exists() ? { id: orderSnap.id, ...orderSnap.data() } : null;
  if (!order) return null;
  let productsArray = [];
  if (Array.isArray(order.products) && order.products.length > 0) productsArray = order.products;
  else if (order.productName) productsArray = [{ productName: order.productName, productBarcode: order.productBarcode || '—', quantity: order.quantity, unit: order.unit }];

  const ratesSnap = await getDocs(collection(db, 'rates_selling'));
  const ratesMap = {};
  ratesSnap.docs.forEach(d => {
    const r = d.data();
    const name = r.productName || r.name || '';
    const unit = r.unit || '';
    if (name) {
      ratesMap[normalizeForMatch(name) + '||' + normalizeForMatch(unit)] = Number(r.sellingPrice ?? r.rate ?? 0);
      if (!ratesMap[normalizeForMatch(name)]) ratesMap[normalizeForMatch(name)] = Number(r.sellingPrice ?? r.rate ?? 0);
    }
  });

  const lines = [];
  let subtotal = 0;
  for (const p of productsArray) {
    const name = p.productName || p.name || '—';
    const unit = p.unit || '—';
    const qty = Number(p.quantity) || 0;
    const rate = ratesMap[normalizeForMatch(name) + '||' + normalizeForMatch(unit)] ?? ratesMap[normalizeForMatch(name)] ?? 0;
    const lineTotal = qty * rate;
    subtotal += lineTotal;
    lines.push({ productName: name, quantity: qty, unit, rate, lineTotal });
  }
  const discountPercent = opts.discountPercent || 0;
  const vatPercent = opts.vatPercent || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = afterDiscount * (vatPercent / 100);
  const grandTotal = afterDiscount + vatAmount;
  return {
    order, lines, subtotal, discountAmount, vatAmount, grandTotal,
    invoiceNo: `INV-${String(order.id || '').slice(-8).toUpperCase() || 'N/A'}`,
    invoiceDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    opts: { ...opts }
  };
}

function renderInvoicePreviewHtml(data) {
  if (!data) return '<p class="error">No invoice data.</p>';
  const companyInfo = window.COMPANY || { name: 'Kathmandu Textile', address: 'Kathmandu', phone: 'N/A', email: 'N/A', panVat: '' };
  const { order, lines, subtotal, discountAmount, vatAmount, grandTotal, invoiceNo, invoiceDate, opts } = data;
  const sig = opts?.sig || 'Authorised';
  const rows = lines.map(l => `<tr><td>${escapeHtml(l.productName)}</td><td>${l.quantity}</td><td>${escapeHtml(l.unit)}</td><td>Rs. ${Number(l.rate).toFixed(2)}</td><td>Rs. ${Number(l.lineTotal).toFixed(2)}</td></tr>`).join('');
  let extraRows = '';
  if (discountAmount > 0) extraRows += `<tr><td colspan="5" style="text-align:right;color:#94a3b8;">Discount (${opts.discountPercent || 0}%)</td><td>Rs. -${Number(discountAmount).toFixed(2)}</td></tr>`;
  if (vatAmount > 0) extraRows += `<tr><td colspan="5" style="text-align:right;color:#94a3b8;">VAT (${opts.vatPercent || 0}%)</td><td>Rs. ${Number(vatAmount).toFixed(2)}</td></tr>`;
  return `<div class="invoice-preview-doc" style="background:linear-gradient(180deg,rgba(15,23,42,0.95) 0%,rgba(7,11,21,0.98) 100%);padding:1.5rem;border-radius:12px;border:1px solid rgba(255,255,255,0.08);">
    <div style="display:flex;justify-content:space-between;margin-bottom:1.5rem;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:1rem;">
      <div><div style="font-size:1.1rem;font-weight:700;color:#f0f4ff;">${escapeHtml(companyInfo.name)}</div><div style="font-size:0.8rem;color:#94a3b8;">${escapeHtml(companyInfo.address)}</div></div>
      <div style="text-align:right;"><div style="font-size:1rem;font-weight:600;color:#f59e0b;">INVOICE</div><div style="font-size:0.8rem;color:#94a3b8;">Date: ${invoiceDate}</div><div style="font-size:0.8rem;color:#94a3b8;">Invoice No: ${invoiceNo}</div></div>
    </div>
    <div style="margin-bottom:1rem;"><div style="font-size:0.9rem;font-weight:600;color:#f0f4ff;">Supplier: ${escapeHtml(order.supplierName || '—')}</div><div style="font-size:0.8rem;color:#94a3b8;">Contact: ${escapeHtml(order.supplierContact || '—')} | Delivery: ${escapeHtml(order.deliveryAddress || order.supplierAddress || '—')}</div></div>
    <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
      <thead><tr style="background:rgba(245,158,11,0.15);color:#fbbf24;"><th style="padding:8px;text-align:left;">Product</th><th>Qty</th><th>Unit</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody style="color:#e2e8f0;">${rows.replace(/<td>.*?<\/td><td>/, '<td>').replace(/<\/td><td>.*?<\/td>/, '</td><td>')}${extraRows}</tbody>
    </table>
    <div style="margin-top:1rem;text-align:right;"><div style="font-size:0.85rem;color:#94a3b8;">Subtotal: Rs. ${Number(subtotal).toFixed(2)}</div>${discountAmount > 0 ? `<div>Discount: Rs. -${Number(discountAmount).toFixed(2)}</div>` : ''}${vatAmount > 0 ? `<div>VAT: Rs. ${Number(vatAmount).toFixed(2)}</div>` : ''}<div style="font-size:1.1rem;font-weight:700;color:#f59e0b;">Grand Total: Rs. ${Number(grandTotal).toFixed(2)}</div></div>
    <div style="margin-top:1rem;">
      <div style="font-family:cursive;font-size:0.9rem;margin-bottom:8px;">${escapeHtml(sig)}</div>
      <div style="border-bottom:1px solid #94a3b8;width:160px;margin:0 auto 6px;"></div>
      <div style="font-size:0.7rem;color:#64748b;text-align:center;">Authorised Signature</div>
    </div>
  </div>`;
}

async function previewOrderInvoice(orderId, opts = {}) {
  if (!invoicePreviewBody || !invoicePreviewModal) return;
  try {
    showToast('Loading invoice…', 'info');
    lastPreviewOrderId = orderId;
    const discToggle = document.getElementById('preview-discount-toggle');
    const vatToggle = document.getElementById('preview-vat-toggle');
    if (discToggle) { discToggle.checked = false; }
    if (vatToggle) { vatToggle.checked = false; }
    const discField = document.getElementById('preview-discount-field');
    const vatField = document.getElementById('preview-vat-field');
    if (discField) discField.style.display = 'none';
    if (vatField) vatField.style.display = 'none';
    const discInput = document.getElementById('preview-discount-percent');
    const vatInput = document.getElementById('preview-vat-percent');
    if (discInput) discInput.value = '';
    if (vatInput) vatInput.value = '13';

    const data = await getInvoiceData(orderId, opts);
    if (!data || data.lines.length === 0) {
      showToast('No products in order.', 'error');
      return;
    }
    invoicePreviewBody.innerHTML = renderInvoicePreviewHtml(data);
    invoicePreviewModal.style.display = 'flex';
    showToast('Preview ready.', 'success');
  } catch (err) {
    console.error('Preview invoice error:', err);
    showToast('Failed: ' + (err.message || ''), 'error');
    invoicePreviewBody.innerHTML = `<p class="error">Failed: ${escapeHtml(err.message || '')}</p>`;
    invoicePreviewModal.style.display = 'flex';
  }
}

function applyPreviewDiscountVat() {
  if (!lastPreviewOrderId || !invoicePreviewBody) return;
  const opts = getPreviewDiscountVatOpts();
  getInvoiceData(lastPreviewOrderId, opts).then(data => {
    if (data) {
      invoicePreviewBody.innerHTML = renderInvoicePreviewHtml(data);
      showToast('Discount/VAT applied.', 'success');
    }
  });
}

async function printOrderInvoice(orderId, opts = {}) {
  try {
    showToast('Generating PDF…', 'info');
    const data = await getInvoiceData(orderId, opts);
    if (!data) { showToast('Order not found.', 'error'); return; }
    if (typeof window.jspdf === 'undefined') { showToast('PDF library not loaded.', 'error'); return; }
    const pdfDoc = await generateOrderInvoicePDF({ ...data, authorisedSignature: opts?.sig || 'Authorised' });
    const safeName = (data.order.supplierName || 'Order').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    pdfDoc.save(`Invoice_${safeName}_${data.invoiceNo}.pdf`);
    showToast('Invoice PDF downloaded.', 'success');
  } catch (err) {
    console.error('Print invoice error:', err);
    showToast('Failed: ' + (err.message || ''), 'error');
  }
}

async function getInvoiceDownloadLink(orderId, opts = {}) {
  const data = await getInvoiceData(orderId, opts);
  if (!data) return null;
  if (typeof window.jspdf === 'undefined') return null;
  const pdfDoc = await generateOrderInvoicePDF({ ...data, authorisedSignature: opts?.sig || 'Authorised' });
  const pdfBlob = pdfDoc.output('blob');
  const safeName = (data.order.supplierName || 'Order').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40);
  const path = `invoices/${auth.currentUser?.uid || 'anon'}_${Date.now()}_Invoice_${orderId}_${safeName}.pdf`;
  const url = await uploadPdfAndGetUrl(pdfBlob, path);
  return { url, order: data.order };
}

async function generateOrderInvoicePDF(data) {
  const companyInfo = window.COMPANY || { name: 'Kathmandu Textile', address: 'Kathmandu', phone: 'N/A', email: 'N/A', panVat: '' };
  const { jsPDF } = window.jspdf;
  const pdfDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdfDoc.internal.pageSize.getWidth();
  const pageH = pdfDoc.internal.pageSize.getHeight();
  let y = 14;
  pdfDoc.setFontSize(12);
  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.text(companyInfo.name || 'Kathmandu Textile', 14, y); y += 5;
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.setFontSize(8);
  pdfDoc.text(companyInfo.address || 'Kathmandu', 14, y); y += 4;
  pdfDoc.text(`Phone: ${companyInfo.phone} | Email: ${companyInfo.email}`, 14, y); y += 6;
  pdfDoc.text('Invoice', pageW - 14, 14, { align: 'right' });
  pdfDoc.text(`Date: ${data.invoiceDate}`, pageW - 14, 19, { align: 'right' });
  pdfDoc.text(`Invoice No: ${data.invoiceNo}`, pageW - 14, 24, { align: 'right' });
  y += 2;
  pdfDoc.setFontSize(11);
  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.text('ORDER INVOICE', pageW / 2, y, { align: 'center' });
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.setFontSize(9);
  y += 10;
  const order = data.order;
  pdfDoc.text(`Supplier: ${order.supplierName || '—'}`, 14, y); y += 5;
  pdfDoc.text(`Contact: ${order.supplierContact || '—'}`, 14, y); y += 5;
  pdfDoc.text(`Delivery: ${order.deliveryAddress || order.supplierAddress || '—'}`, 14, y); y += 1;
  const tableBody = data.lines.map(l => [l.productName, String(l.quantity), l.unit, `Rs. ${Number(l.rate).toFixed(2)}`, `Rs. ${Number(l.lineTotal).toFixed(2)}`]);
  if (tableBody.length === 0) tableBody.push(['—', '—', '—', '—', '0.00', '0.00']);
  pdfDoc.autoTable({ startY: y, head: [['Product', 'Qty', 'Unit', 'Rate (Rs.)', 'Amount (Rs.)']], body: tableBody, theme: 'grid', margin: { left: 14, right: 14 }, styles: { fontSize: 8 }, headStyles: { fillColor: [245, 158, 11] } });
  y = pdfDoc.lastAutoTable.finalY + 6;
  if (data.discountAmount > 0) { pdfDoc.text(`Discount: Rs. -${Number(data.discountAmount).toFixed(2)}`, 14, y); y += 5; }
  if (data.vatAmount > 0) { pdfDoc.text(`VAT: Rs. ${Number(data.vatAmount).toFixed(2)}`, 14, y); y += 5; }
  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.text(`Grand Total: Rs. ${Number(data.grandTotal).toFixed(2)}`, 14, y); y += 14;

  // Authorised signature - FIXED: text above line
  pdfDoc.setFont('times', 'italic');
  pdfDoc.setFontSize(10);
  pdfDoc.text(data.authorisedSignature || 'Authorised', 14, y);
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.setFontSize(8);
  pdfDoc.text('_______________', 14, y + 8);
  pdfDoc.text('Authorised Signature', 14, y + 14);
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.setFontSize(8);
  pdfDoc.text('_______________', pageW / 2 + 20, y);
  pdfDoc.text('Company Stamp', pageW / 2 + 20, y + 5);
  y += 22;

  // Footer note
  pdfDoc.setTextColor(100, 100, 100);
  pdfDoc.text('Note: System-generated invoice. Prices from selling rates catalog.', 14, y, { maxWidth: pageW - 28 });
  y += 8;

  // Company stamp (bottom-right) - FIXED: stamp above line
  const stampDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const stampW = 45;
  const stampH = 24;
  const stampX = pageW - 14 - stampW;
  const stampY = pageH - 20 - stampH;  // Raised up 6mm for line space
  pdfDoc.setDrawColor(180, 60, 60);
  pdfDoc.setLineWidth(0.5);
  pdfDoc.rect(stampX, stampY, stampW, stampH);
  pdfDoc.setFontSize(5);
  pdfDoc.setTextColor(120, 40, 40);
  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.text('COMPANY STAMP', stampX + stampW / 2, stampY + 6, { align: 'center' });
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.text((companyInfo.name || 'Kathmandu Textile').slice(0, 28), stampX + stampW / 2, stampY + 12, { align: 'center', maxWidth: stampW - 4 });
  pdfDoc.text(stampDate, stampX + stampW / 2, stampY + 19, { align: 'center' });
  // Stamp line below
  pdfDoc.setDrawColor(120, 40, 40);
  pdfDoc.setLineWidth(0.3);
  pdfDoc.line(stampX, stampY + stampH + 2, stampX + stampW, stampY + stampH + 2);
  pdfDoc.setTextColor(0, 0, 0);

  return pdfDoc;
}

// ── Order delete functions ──
let deleteOrderId = null;
const deleteOrderModal = document.getElementById('delete-wage-modal'); // Reuse wage modal (generic)
const deleteOrderDetails = document.getElementById('delete-wage-details'); // Reuse
const btnConfirmOrderDelete = document.getElementById('btn-confirm-delete');
const btnCancelOrderDelete = document.getElementById('btn-cancel-delete');
const modalCloseOrderDelete = document.getElementById('modal-close-delete');

function openOrderDeleteModal(el) {
  deleteOrderId = el.dataset.id;
  const product = el.dataset.product;
  const supplier = el.dataset.supplier || '—';
  const qty = el.dataset.qty || '—';
  const status = el.dataset.status || '—';

  if (deleteOrderDetails) {
    deleteOrderDetails.innerHTML = `
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;">
        <span style="color:#94a3b8;">Product:</span><span style="color:#f0f4ff;font-weight:600;">${product}</span>
        <span style="color:#94a3b8;">Supplier:</span><span style="color:#f0f4ff;">${supplier}</span>
        <span style="color:#94a3b8;">Qty:</span><span style="color:#f0f4ff;">${qty}</span>
        <span style="color:#94a3b8;">Status:</span><span style="color:#f0f4ff;">${status}</span>
      </div>`;
  }

  document.querySelector('#delete-wage-modal h3').textContent = '🗑️ Delete Order';
  if (deleteOrderModal) deleteOrderModal.style.display = 'flex';
}

function closeOrderDeleteModal() {
  deleteOrderId = null;
  if (deleteOrderModal) deleteOrderModal.style.display = 'none';
}

async function confirmDeleteOrder() {
  if (!deleteOrderId) return;

  const btn = btnConfirmOrderDelete;
  const originalText = btn.textContent;

  try {
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    btn.style.opacity = '0.6';

    await deleteDoc(doc(db, 'orders', deleteOrderId));

    showToast('Order deleted successfully', 'success');
    closeOrderDeleteModal();
    loadManagerOrders();

  } catch (err) {
    console.error('Failed to delete order:', err);
    showToast('Failed to delete: ' + (err.message || err), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    btn.style.opacity = '1';
  }
}

// Event listeners for order delete (reuse wage modal handlers)
btnConfirmOrderDelete.addEventListener('click', confirmDeleteOrder);
btnCancelOrderDelete.addEventListener('click', closeOrderDeleteModal);
modalCloseOrderDelete.addEventListener('click', closeOrderDeleteModal);

// Invoice signature modal
initInvoiceSignatureModal();

async function deleteOrder(orderId, productName) {
  openOrderDeleteModal({dataset: {id: orderId, product: productName}});
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
  website: 'kathmandutextile.com',
  authorisedSignature: 'Authorised Signatory'
};

// Make COMPANY available globally for invoice generation
window.COMPANY = COMPANY;

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
    ? `Bank: ${emp.bankName || '—'}<br>Account No: ${emp.bankAccountNumber || '—'}`
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
        <div class="payslip-sig-box">
          <div class="payslip-sig-name" style="font-style:italic;font-size:0.85rem;margin-bottom:4px;">${escapeHtml(COMPANY.authorisedSignature || 'Authorised Signatory')}</div>
          <div class="payslip-sig-line"></div>
          <div class="payslip-sig-label">Authorised Signature</div>
        </div>
        <div class="payslip-sig-box payslip-stamp-box" style="border:1.5px solid #a03030;border-radius:4px;padding:6px 8px;min-width:100px;">
          <div style="font-size:0.6rem;font-weight:700;color:#782020;text-align:center;letter-spacing:0.5px;">COMPANY STAMP</div>
          <div style="font-size:0.6rem;color:#782020;text-align:center;margin:2px 0;">${escapeHtml((COMPANY.name || 'KTT').slice(0, 26))}</div>
          <div style="font-size:0.55rem;color:#782020;text-align:center;">${payDate}</div>
        </div>
      </div>
      <div class="payslip-disclaimer">Note: This is a system-generated payslip based on recorded production, fibre usage, and approved payroll data.</div>
    </div>`;
}

async function generatePayslipPDF(data) {
  if (!window.jspdf?.jsPDF) {
    throw new Error('PDF library not loaded. Please refresh the page.');
  }
  const { jsPDF } = window.jspdf;
  const pdfDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = pdfDoc.internal.pageSize.getWidth();
  let y = 14;

  pdfDoc.setFontSize(12);
  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.text(COMPANY.name || 'Kathmandu Textile', 14, y); y += 5;
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.setFontSize(8);
  pdfDoc.text(COMPANY.address || 'Kathmandu, Nepal', 14, y); y += 4;
  pdfDoc.text(`Phone: ${COMPANY.phone || 'N/A'} | Email: ${COMPANY.email || 'N/A'}`, 14, y); y += 4;
  pdfDoc.text(COMPANY.panVat || '', 14, y); y += 6;

  pdfDoc.text('Payslip', pageW - 14, 14, { align: 'right' });
  pdfDoc.text(`Date: ${getPayslipDate(data.month, data.year)}`, pageW - 14, 19, { align: 'right' });
  pdfDoc.text(`Slip No: ${data.slipNo}`, pageW - 14, 24, { align: 'right' });

  pdfDoc.setFontSize(11);
  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.text('SALARY PAYSLIP', pageW / 2, 36, { align: 'center' });
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.setFontSize(9);
  pdfDoc.text(`For the month of ${data.month} ${data.year}`, pageW / 2, 42, { align: 'center' });
  y = 50;

  const emp = data.emp;
  pdfDoc.text(`Name: ${emp.fullName || emp.name || '—'}`, 14, y); y += 5;
  pdfDoc.text(`Employee ID: ${emp.id || '—'}`, 14, y); y += 5;
  pdfDoc.text(`Department: ${emp.department || '—'}`, 14, y); y += 5;
  pdfDoc.text(`Designation: ${emp.position || '—'}`, 14, y); y += 5;
  pdfDoc.text(`Pay Period: ${getPayPeriod(data.month, data.year)}`, pageW / 2 + 10, 50);
  pdfDoc.text(`Method of Payment: ${data.hasBank ? 'Bank' : 'Cash'}`, pageW / 2 + 10, 55);
  if (data.hasBank) {
    pdfDoc.text(`Bank: ${emp.bankName || '—'} | A/C: ${emp.bankAccountNumber || '—'}`, pageW / 2 + 10, 60);
  }
  y += 10;

  const earnBody = data.deptEarnings.map(d => [d.department, Number(d.amount).toFixed(2)]);
  if (earnBody.length === 0) earnBody.push(['—', '0.00']);
  pdfDoc.autoTable({
    startY: y,
    head: [['Earnings - Description', 'Amount (Rs.)']],
    body: earnBody,
    theme: 'grid',
    margin: { left: 14 },
    styles: { fontSize: 8 }
  });
  y = pdfDoc.lastAutoTable.finalY + 4;
  pdfDoc.autoTable({
    startY: y,
    head: [['Deductions - Description', 'Amount (Rs.)']],
    body: [['Deductions', Number(data.totalDeductions).toFixed(2)]],
    theme: 'grid',
    margin: { left: 14 },
    styles: { fontSize: 8 }
  });
  y = pdfDoc.lastAutoTable.finalY + 8;

  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.setFontSize(12);
  pdfDoc.text(`Total Earnings: ${Number(data.totalEarnings).toFixed(2)}`, 14, y); y += 6;
  pdfDoc.text(`Total Deductions: ${Number(data.totalDeductions).toFixed(2)}`, 14, y); y += 6;
  pdfDoc.text(`Net Pay (Rs.): ${Number(data.totalNet).toFixed(2)}`, 14, y);
  y += 16;

  // Signature area (left)
  const sigName = COMPANY.authorisedSignature || 'Authorised Signatory';
  pdfDoc.setFont('times', 'italic');
  pdfDoc.setFontSize(9);
  pdfDoc.text(sigName, 14, y);
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.setFontSize(8);
  pdfDoc.setDrawColor(80, 80, 80);
  pdfDoc.setLineWidth(0.2);
  pdfDoc.line(14, y + 4, 14 + 45, y + 4);
  pdfDoc.text('Authorised Signature', 14, y + 10);

  // Company stamp box (right)
  const pageH = pdfDoc.internal.pageSize.getHeight();
  const stampW = 42;
  const stampH = 22;
  const stampX = pageW - 14 - stampW;
  const stampY = y - 4;
  const stampDate = getPayslipDate(data.month, data.year);
  pdfDoc.setDrawColor(160, 50, 50);
  pdfDoc.setLineWidth(0.5);
  pdfDoc.rect(stampX, stampY, stampW, stampH);
  pdfDoc.setFontSize(5);
  pdfDoc.setTextColor(120, 40, 40);
  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.text('COMPANY STAMP', stampX + stampW / 2, stampY + 5, { align: 'center' });
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.text((COMPANY.name || 'KTT').slice(0, 26), stampX + stampW / 2, stampY + 11, { align: 'center', maxWidth: stampW - 4 });
  pdfDoc.text(stampDate, stampX + stampW / 2, stampY + 17, { align: 'center' });
  pdfDoc.setTextColor(0, 0, 0);
  pdfDoc.setFontSize(8);

  y += 24;

  pdfDoc.setTextColor(100, 100, 100);
  pdfDoc.text('Note: This is a system-generated payslip based on recorded production, fibre usage, and approved payroll data.', 14, y, { maxWidth: pageW - 28 });

  pdfDoc.text('Note: Deduciton is from Employee Provident, advance payment, CTZ, insurance etc.', 14, y + 5, { maxWidth: pageW - 28 });
  return pdfDoc;
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
  if (!empId || !month) { 
    showToast('Please select employee and month first.', 'error'); 
    return; 
  }
  
  if (!window.jspdf?.jsPDF) {
    showToast('PDF library failed to load. Please refresh the page.', 'error');
    return;
  }
  
  try {
    const data = await getSlipData(empId, month, year);
    if (!data) {
      showToast('Employee not found.', 'error');
      return;
    }
    if (data.entries.length === 0) { 
      showToast('No wage entries found for this employee and period.', 'error'); 
      return; 
    }
    
    const pdfDoc = await generatePayslipPDF(data);
    const empName = (data.emp.fullName || data.emp.name || 'Employee').replace(/[^a-zA-Z0-9]/g, '_');
    const safeMonth = month.replace(/[^a-zA-Z]/g, '');
    pdfDoc.save(`KTT-Payslip_${empName}_${safeMonth}_${year}.pdf`);
    showToast(`✅ Payslip downloaded for ${data.emp.fullName || data.emp.name || 'employee'}`, 'success');
  } catch (err) {
    console.error('PDF generation failed:', err);
    showToast(`❌ Failed to generate PDF: ${err.message || 'Unknown error'}`, 'error');
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
    allWageEntries = [...entries];
    entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    tblWageEntriesBody.innerHTML = '';
    if (!entries.length) {
      tblWageEntriesBody.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#94a3b8;padding:1.5rem;">No wage entries found.</td></tr>';
      return;
    }
    entries.forEach(w => {
      const empName = employees.find(e => e.id === w.employeeId)?.fullName || w.employeeName || w.employeeId || '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(w.date || '—')}</td><td>${escapeHtml(empName)}</td><td>${escapeHtml(w.employeeId || '—')}</td>
        <td>${escapeHtml(w.department || '—')}</td><td>${escapeHtml(w.item || '—')}</td><td>${w.qty || 0}</td>
        <td>${escapeHtml(w.unit || '—')}</td><td>${w.rate || 0}</td><td>${w.ot || 0}</td><td>${w.bonus || 0}</td>
        <td>${w.deduct || 0}</td><td>${w.tax || 0}</td><td><strong style="color:#f59e0b">Rs. ${(w.net || 0).toLocaleString()}</strong></td>
        <td><button class="btn-delete-wage" data-id="${w.id}" data-emp="${escapeHtml(empName)}" data-date="${escapeHtml(w.date || '—')}" data-item="${escapeHtml(w.item || '—')}" data-qty="${w.qty || 0}" data-net="${w.net || 0}" title="Delete">🗑️</button></td>`;
      tblWageEntriesBody.appendChild(tr);
    });
    tblWageEntriesBody.querySelectorAll('.btn-delete-wage').forEach(btn => {
      btn.addEventListener('click', () => openDeleteWageModal(btn));
    });
  } catch (err) {
    console.error('Failed to load wage entries:', err);
    tblWageEntriesBody.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#ef4444;">Failed to load wage entries.</td></tr>';
  }
}

// Parse CSV row handling quoted fields and embedded commas
function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

// Parse CSV text into rows of columns
function parseCSVText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const header = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.some(c => c)) rows.push(cols);
  }
  return { header, rows };
}

// Create duplicate key from wage entry
function wageEntryKey(w) {
  const empId = String(w.employeeId || '').trim();
  const date = String(w.date || '').trim();
  const dept = String(w.department || '').trim();
  const item = String(w.item || '').trim();
  const qty = String(Number(w.qty) || 0);
  const rate = String(Number(w.rate) || 0);
  const ot = String(Number(w.ot) || 0);
  const bonus = String(Number(w.bonus) || 0);
  const deduct = String(Number(w.deduct) || 0);
  const tax = String(Number(w.tax) || 0);
  return `${empId}|${date}|${dept}|${item}|${qty}|${rate}|${ot}|${bonus}|${deduct}|${tax}`;
}

// Resolve employee ID from CSV Emp ID or Employee name
function resolveEmployeeId(empIdCol, empNameCol) {
  const empId = String(empIdCol || '').trim();
  const empName = String(empNameCol || '').trim();
  if (empId && employees.some(e => e.id === empId)) return empId;
  const byName = employees.find(e => {
    const n = (e.fullName || e.name || '').trim();
    return n === empName || n.toLowerCase().includes(empName.toLowerCase());
  });
  return byName ? byName.id : null;
}

async function importWageEntriesCSV(file) {
  if (!file || !file.name.toLowerCase().endsWith('.csv')) {
    showToast('Please select a valid CSV file.', 'error');
    return;
  }
  const btnImport = document.getElementById('btn-wage-import-csv');
  const inpFile = document.getElementById('wage-import-file');
  const originalText = btnImport?.textContent;
  if (btnImport) { btnImport.disabled = true; btnImport.textContent = 'Importing...'; }
  try {
    const snap = await getDocs(collection(db, 'wageEntries'));
    allWageEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const holidaysSnap = await getDocs(collection(db, 'holidays'));
    const holidaysForImport = holidaysSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const text = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result || '');
      r.onerror = () => reject(new Error('Failed to read file'));
      r.readAsText(file, 'UTF-8');
    });
    const { header, rows } = parseCSVText(text);
    if (rows.length === 0) {
      showToast('No data rows found in CSV.', 'warning');
      return;
    }
    const colMap = {};
    const wanted = ['Date', 'Employee', 'Emp ID', 'Department', 'Item', 'Qty', 'Unit', 'Rate', 'OT', 'Bonus', 'Deduct', 'Tax', 'Net Wage'];
    wanted.forEach((name, idx) => {
      const i = header.findIndex(h => String(h).trim().toLowerCase() === name.toLowerCase());
      if (i >= 0) colMap[name] = i;
    });
    const get = (row, name) => (colMap[name] >= 0 && colMap[name] < row.length) ? row[colMap[name]] : '';
    const existingKeys = new Set(allWageEntries.map(wageEntryKey));
    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      const dateRaw = get(row, 'Date');
      const date = dateRaw ? String(dateRaw).trim() : '';
      if (!date) { skipped++; continue; }
      const empId = resolveEmployeeId(get(row, 'Emp ID'), get(row, 'Employee'));
      if (!empId) { skipped++; continue; }
      const emp = employees.find(e => e.id === empId);
      const employeeName = emp ? (emp.fullName || emp.name || emp.id) : get(row, 'Employee') || empId;
      const department = String(get(row, 'Department') || '').trim();
      const item = String(get(row, 'Item') || '').trim();
      const qty = Number(get(row, 'Qty')) || 0;
      const unit = String(get(row, 'Unit') || '').trim() || 'piece';
      const rate = Number(get(row, 'Rate')) || 0;
      const ot = Number(get(row, 'OT')) || 0;
      const bonus = Number(get(row, 'Bonus')) || 0;
      const deduct = Number(get(row, 'Deduct')) || 0;
      const tax = Number(get(row, 'Tax')) || 0;
      const netFromCsv = Number(get(row, 'Net Wage'));
      const net = !isNaN(netFromCsv) && netFromCsv !== 0
        ? netFromCsv
        : (qty * rate) + (ot * rate) + bonus - deduct - tax;
      const isOnHoliday = await isEmployeeOnHolidayOnDate(empId, date, holidaysForImport);
      if (isOnHoliday) {
        skipped++;
        continue;
      }
      const entry = { employeeId: empId, employeeName, date, department, item, qty, unit, rate, ot, bonus, deduct, tax, net };
      const key = wageEntryKey(entry);
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }
      await addDoc(collection(db, 'wageEntries'), entry);
      existingKeys.add(key);
      imported++;
    }
    if (inpFile) inpFile.value = '';
    await loadWageEntries();
    showToast(`Imported ${imported} wage entries, skipped ${skipped} duplicate/invalid rows.`, imported > 0 ? 'success' : 'info');
  } catch (err) {
    console.error('Import failed:', err);
    showToast('Import failed: ' + (err.message || err), 'error');
  } finally {
    if (btnImport) { btnImport.disabled = false; btnImport.textContent = originalText || 'Import CSV'; }
  }
}

const btnWageImportCsv = document.getElementById('btn-wage-import-csv');
const wageImportFileInput = document.getElementById('wage-import-file');

if (btnWageImportCsv && wageImportFileInput) {
  btnWageImportCsv.addEventListener('click', () => wageImportFileInput.click());
  wageImportFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importWageEntriesCSV(file);
  });
}

if (btnPreviewSlip) {
  btnPreviewSlip.addEventListener('click', async () => {
    const originalText = btnPreviewSlip.textContent;
    btnPreviewSlip.disabled = true;
    btnPreviewSlip.textContent = 'Loading...';
    try {
      await showSlipPreview();
    } finally {
      btnPreviewSlip.disabled = false;
      btnPreviewSlip.textContent = originalText;
    }
  });
}

if (btnDownloadSlip) {
  btnDownloadSlip.addEventListener('click', async () => {
    const originalText = btnDownloadSlip.textContent;
    btnDownloadSlip.disabled = true;
    btnDownloadSlip.textContent = 'Generating...';
    try {
      await downloadSlipPDF();
    } catch (err) {
      console.error('Download failed:', err);
      showToast('Download failed: ' + (err.message || 'Please try again'), 'error');
    } finally {
      btnDownloadSlip.disabled = false;
      btnDownloadSlip.textContent = originalText;
    }
  });
}

if (btnShareSlip) {
  btnShareSlip.addEventListener('click', () => {
    if (!selSlipEmployee?.value || !selSlipMonth?.value) {
      showToast('Generate payslip first (Preview), then Share.', 'error');
      return;
    }
    document.getElementById('share-modal')?.style?.setProperty('display', 'flex');
  });
}

// ─── Upload PDF to Firebase Storage and get download URL ───
async function uploadPdfAndGetUrl(blob, storagePath) {
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

// ─── Share via SMS, WhatsApp, Email (opens app with pre-filled message) ───
function extractPhoneForWa(contact) {
  if (!contact || typeof contact !== 'string') return null;
  const digits = contact.replace(/\D/g, '');
  if (digits.length < 10) return null;
  let num = digits;
  if (!num.startsWith('977') && num.length === 10) num = '977' + num;
  if (num.startsWith('0')) num = '977' + num.slice(1);
  return num;
}

function isEmailLike(str) {
  return str && typeof str === 'string' && str.includes('@') && str.length > 5;
}

function openSms(url, message, phone) {
  if (!url) { showToast('Get download link first.', 'error'); return; }
  const body = encodeURIComponent(message + ' ' + url);
  const href = phone ? `sms:${encodeURIComponent(phone.replace(/\s/g, ''))}?body=${body}` : `sms:?body=${body}`;
  window.open(href, '_blank');
}

function openWhatsApp(url, message, phone) {
  if (!url) { showToast('Get download link first.', 'error'); return; }
  const text = encodeURIComponent(message + ' ' + url);
  const num = phone ? extractPhoneForWa(phone) : null;
  const href = num ? `https://wa.me/${num}?text=${text}` : `https://api.whatsapp.com/send?text=${text}`;
  window.open(href, '_blank');
}

function openMail(url, subject, body, email) {
  if (!url) { showToast('Get download link first.', 'error'); return; }
  const fullBody = body + ' ' + url;
  const params = new URLSearchParams({ subject: subject || 'Download link', body: fullBody });
  const href = email ? `mailto:${encodeURIComponent(email)}?${params}` : `mailto:?${params}`;
  window.location.href = href;
}

// Parse supplierContact: if contains @ treat as email, else as phone
function parseSupplierContact(contact) {
  if (!contact || typeof contact !== 'string') return { phone: null, email: null };
  const c = contact.trim();
  if (isEmailLike(c)) return { phone: null, email: c };
  return { phone: c, email: null };
}

// Share modal handlers
if (btnShareEmail) {
  btnShareEmail.addEventListener('click', async () => {
    try {
      const originalText = btnShareEmail.textContent;
      btnShareEmail.disabled = true;
      btnShareEmail.textContent = 'Generating...';
      
      const empId = selSlipEmployee.value;
      const month = selSlipMonth.value;
      const year = selSlipYear?.value || new Date().getFullYear().toString();
      
      const data = await getSlipData(empId, month, year);
      if (!data || data.entries.length === 0) {
        showToast('No data to share.', 'error');
        return;
      }
      
      const pdfDoc = await generatePayslipPDF(data);
      const pdfBlob = pdfDoc.output('blob');
      
      const empName = data.emp.fullName || data.emp.name || 'Employee';
      const fileName = `Payslip_${empName.replace(/[^a-zA-Z0-9]/g, '_')}_${month}_${year}.pdf`;
      
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      closeShareModal();
      showToast('Payslip downloaded for sharing.', 'success');
    } catch (err) {
      console.error('Share failed:', err);
      showToast('Share failed: ' + (err.message || 'Please try preview first'), 'error');
    } finally {
      btnShareEmail.disabled = false;
      btnShareEmail.textContent = 'Download PDF';
    }
  });
}

// Get payslip download link (upload to Storage, show URL)
const btnGetPayslipLink = document.getElementById('btn-get-payslip-link');
const payslipLinkResult = document.getElementById('payslip-link-result');
const payslipDownloadUrlInput = document.getElementById('payslip-download-url');
const btnCopyPayslipUrl = document.getElementById('btn-copy-payslip-url');

if (btnGetPayslipLink) {
  btnGetPayslipLink.addEventListener('click', async () => {
    try {
      btnGetPayslipLink.disabled = true;
      btnGetPayslipLink.textContent = 'Generating...';
      if (payslipLinkResult) payslipLinkResult.style.display = 'none';

      const empId = selSlipEmployee.value;
      const month = selSlipMonth.value;
      const year = selSlipYear?.value || new Date().getFullYear().toString();
      const data = await getSlipData(empId, month, year);

      if (!data || data.entries.length === 0) {
        showToast('No data to share.', 'error');
        return;
      }

      const pdfDoc = await generatePayslipPDF(data);
      const pdfBlob = pdfDoc.output('blob');
      const empName = (data.emp.fullName || data.emp.name || 'Employee').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 30);
      const safeMonth = month.replace(/[^a-zA-Z]/g, '');
      const path = `payslips/${auth.currentUser?.uid || 'anon'}_${Date.now()}_Payslip_${empName}_${safeMonth}_${year}.pdf`;

      const url = await uploadPdfAndGetUrl(pdfBlob, path);
      if (payslipDownloadUrlInput) payslipDownloadUrlInput.value = url;
      if (payslipLinkResult) payslipLinkResult.style.display = 'block';
      lastPayslipShareData = { url, emp: data.emp, month, year };
      showToast('Payslip link ready. Copy and send to employee.', 'success');
    } catch (err) {
      console.error('Get payslip link failed:', err);
      showToast('Failed: ' + (err.message || ''), 'error');
    } finally {
      btnGetPayslipLink.disabled = false;
      btnGetPayslipLink.textContent = 'Get Download Link';
    }
  });
}

if (btnCopyPayslipUrl) {
  btnCopyPayslipUrl.addEventListener('click', () => {
    if (payslipDownloadUrlInput?.value) {
      navigator.clipboard.writeText(payslipDownloadUrlInput.value);
      showToast('URL copied to clipboard.', 'success');
    }
  });
}

// Payslip: SMS, WhatsApp, Mail
const btnPayslipSms = document.getElementById('btn-payslip-sms');
const btnPayslipWa = document.getElementById('btn-payslip-whatsapp');
const btnPayslipMail = document.getElementById('btn-payslip-mail');
const payslipMsg = (m, y, url) => `Your salary payslip for ${m} ${y}: ${url}`;
if (btnPayslipSms) {
  btnPayslipSms.addEventListener('click', () => {
    const url = payslipDownloadUrlInput?.value || lastPayslipShareData?.url;
    const d = lastPayslipShareData;
    const msg = d ? payslipMsg(d.month, d.year, url) : `Your salary payslip: ${url}`;
    openSms(url, msg, d?.emp?.phone);
  });
}
if (btnPayslipWa) {
  btnPayslipWa.addEventListener('click', () => {
    const url = payslipDownloadUrlInput?.value || lastPayslipShareData?.url;
    const d = lastPayslipShareData;
    const msg = d ? payslipMsg(d.month, d.year, url) : `Your salary payslip: ${url}`;
    openWhatsApp(url, msg, d?.emp?.phone);
  });
}
if (btnPayslipMail) {
  btnPayslipMail.addEventListener('click', () => {
    const url = payslipDownloadUrlInput?.value || lastPayslipShareData?.url;
    const d = lastPayslipShareData;
    const msg = d ? payslipMsg(d.month, d.year, url) : `Your salary payslip: ${url}`;
    openMail(url, 'Salary Payslip', msg, d?.emp?.email);
  });
}

if (btnShareWhatsApp) {
  btnShareWhatsApp.addEventListener('click', async () => {
    try {
      showToast('WhatsApp sharing not implemented yet. Download instead.', 'info');
      // Future: Generate PDF blob → data URL → WhatsApp web URL
      // For now, trigger download like email
      document.getElementById('btn-share-email').click();
    } catch (err) {
      showToast('Share failed.', 'error');
    }
  });
}

if (btnCancelShare) btnCancelShare.addEventListener('click', closeShareModal);
if (modalCloseShare) modalCloseShare.addEventListener('click', closeShareModal);

document.getElementById('punch-records-refresh')?.addEventListener('click', () => loadPunchRecords(db));
document.getElementById('punch-records-filter-employee')?.addEventListener('change', renderPunchRecords);
document.getElementById('punch-records-filter-date-from')?.addEventListener('change', renderPunchRecords);
document.getElementById('punch-records-filter-date-to')?.addEventListener('change', renderPunchRecords);

function closeShareModal() {
  const linkResult = document.getElementById('payslip-link-result');
  if (linkResult) linkResult.style.display = 'none';
  document.getElementById('share-modal')?.style?.setProperty('display', 'none');
}

// init
(async function(){
  await Promise.all([loadEmployees(), loadRates(), loadManagerUserNameMap()]);
  // set default date
  if (inpDate) inpDate.valueAsDate = new Date();
  // Load wage entries table
  loadWageEntries();
  // If URL has #holiday, switch to Manage Holiday panel
  const hash = window.location.hash.slice(1);
  if (hash === 'holiday') {
    const link = document.querySelector('.manager-nav-link[data-section="holiday"]');
    if (link) link.click();
  }
})();
