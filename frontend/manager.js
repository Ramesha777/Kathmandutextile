// manager.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, serverTimestamp, doc, updateDoc, deleteDoc, query } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
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
      const contentEl = document.querySelector('.manager-content-inner');
      if (contentEl) {
        const iframe = contentEl.querySelector('iframe');
        if (!iframe) {
          contentEl.innerHTML = '<div class="performance-embed-loading">Loading Performance Dashboard...</div>';
          setTimeout(() => {
            contentEl.innerHTML = '<iframe src="performance.html#embed" style="width:100%; height:600px; border:none; border-radius:12px;"></iframe>';
          }, 100);
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
  } catch (e) {
    console.warn('loadRates failed', e);
  }
}

// Load and display wage entries
async function loadWageEntries() {
  if (!tblWageEntriesBody) return;
  try {
    const snap = await getDocs(collection(db, 'wageEntries'));
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Sort by date descending (most recent first)
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (entries.length === 0) {
      tblWageEntriesBody.innerHTML = '<tr><td colspan="14" style="text-align:center;">No wage entries yet</td></tr>';
      return;
    }
    
    // Build employee lookup for names
    const empSnap = await getDocs(collection(db, 'employees'));
    const empMap = {};
    empSnap.docs.forEach(d => {
      empMap[d.id] = d.data().fullName || d.data().name || d.data().email || d.id;
    });
    
    let html = '';
    entries.forEach(e => {
      const empName = empMap[e.employeeId] || e.employeeId || '—';
      html += `
        <tr>
          <td>${e.date || '—'}</td>
          <td>${empName}</td>
          <td>${e.department || '—'}</td>
          <td>${e.item || '—'}</td>
          <td>${e.qty || 0}</td>
          <td>${e.unit || '—'}</td>
          <td>Rs. ${(e.rate || 0).toLocaleString()}</td>
          <td>Rs. ${(e.wages || 0).toLocaleString()}</td>
          <td>${e.ot || 0}</td>
          <td>Rs. ${(e.otPay || 0).toLocaleString()}</td>
          <td>Rs. ${(e.bonus || 0).toLocaleString()}</td>
          <td>Rs. ${(e.deduct || 0).toLocaleString()}</td>
          <td><strong>Rs. ${(e.net || 0).toLocaleString()}</strong></td>
          <td>
            <button type="button" class="btn btn-sm btn-outline wage-manage-toggle" data-id="${e.id}">Manage</button>
            <div class="wage-row-actions" id="wage-actions-${e.id}" style="display:none; margin-top:6px;">
              <button type="button" class="btn btn-sm btn-outline wage-edit" data-id="${e.id}">Edit</button>
              <button type="button" class="btn btn-sm btn-primary wage-delete" data-id="${e.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    });
    tblWageEntriesBody.innerHTML = html;
  } catch (err) {
    console.error('Failed to load wage entries:', err);
    if (tblWageEntriesBody) {
      tblWageEntriesBody.innerHTML = '<tr><td colspan="14" style="text-align:center;color:red;">Failed to load wage entries</td></tr>';
    }
  }
}

function populateRateOptionsForDept(dept) {
  selItem.innerHTML = '<option value="">Select item</option>';
  inpRate.value = '';
  let list = [];
  const lower = (dept||'').toLowerCase();
  if (lower.includes('machine')) list = rates.machine;
  else if (lower.includes('production')) list = rates.production;
  else list = rates.daily;

  if (!list || list.length === 0) {
    return;
  }
  
  // Populate item dropdown with fibre names 
  list.forEach(r => {
    const rateVal = Number(r.ratePerMeter ?? r.ratePerPiece ?? r.hourlyRate ?? r.rate ?? 0);
    const itemName = r.name || r.label || '';
    
    // Add to item dropdown
    if (itemName) {
      const itemOpt = document.createElement('option');
      itemOpt.value = itemName;
      itemOpt.textContent = itemName;
      itemOpt.setAttribute('data-rate', rateVal);
      selItem.appendChild(itemOpt);
    }
  });
}

// Handle employee input/datalist selection
inpEmployee.addEventListener('input', function() {
  const inputVal = this.value;
  
  // Find matching employee from datalist selection
  const options = datalistEmployee.querySelectorAll('option');
  let selectedId = null;
  
  for (const opt of options) {
    if (opt.value === inputVal) {
      selectedId = opt.getAttribute('data-id');
      break;
    }
  }
  
  // Also check if user typed an employee ID directly
  if (!selectedId) {
    const empById = employees.find(e => e.id === inputVal);
    if (empById) {
      selectedId = empById.id;
    }
  }
  
  if (selectedId) {
    inpEmployeeId.value = selectedId;
    const emp = employees.find(e => e.id === selectedId);
    if (emp) {
      if (emp.defaultUnit) inpUnit.value = emp.defaultUnit;
    }
  } else {
    inpEmployeeId.value = '';
  }
});

// Also handle manual selection from datalist
inpEmployee.addEventListener('change', function() {
  const inputVal = this.value;
  const options = datalistEmployee.querySelectorAll('option');
  
  for (const opt of options) {
    if (opt.value === inputVal) {
      inpEmployeeId.value = opt.getAttribute('data-id');
      const emp = employees.find(e => e.id === inpEmployeeId.value);
      if (emp) {
        if (emp.defaultUnit) inpUnit.value = emp.defaultUnit;
      }
      break;
    }
  }
});

// Handle department selection - load rates when department is selected
selDept.addEventListener('change', function() {
  const dept = this.value;
  if (dept) {
    populateRateOptionsForDept(dept);
  } else {
    selRate.innerHTML = '<option value="0">Select department first</option>';
  }
});

// Handle item selection - auto-select the rate for that item
selItem.addEventListener('change', function() {
  const selectedOption = this.options[this.selectedIndex];
  const rateVal = selectedOption.getAttribute('data-rate');
  if (rateVal) {
    inpRate.value = rateVal;
  }
});

btnSave.addEventListener('click', async () => {
  const employeeId = inpEmployeeId.value;
  const date = inpDate.value;
  const dept = selDept.value;
  const item = (selItem.value || '').trim();
  const qty = Number(inpQty.value) || 0;
  const unit = (inpUnit.value || '').trim();
  const rate = Number(inpRate.value) || 0;
  const ot = Number(inpOT.value) || 0;
  const bonus = Number(inpBonus.value) || 0;
  const deduct = Number(inpDeduct.value) || 0;

  if (!employeeId || !date || !dept || !item) {
    showToast('Please fill required fields', 'error');
    return;
  }

  const wages = qty * rate;
  const otPay = ot * (rate / 8) * 1.5;
  const net = wages + otPay + bonus - deduct;

  // For Machine Operators: reduce inventory when item (e.g. Cotton) and qty are entered
  const isMachineOps = (dept || '').toLowerCase().includes('machine');
  if (isMachineOps && item && qty > 0) {
    const invResult = await reduceInventoryForMachineOps(item, qty);
    if (!invResult.success) {
      showToast(invResult.message || 'Could not reduce inventory', 'error');
      return;
    }
  }

  try {
    await addDoc(collection(db,'wageEntries'), {
      employeeId,
      date,
      department: dept || null,
      item,
      qty, unit, rate, wages,
      ot, otPay,
      bonus, deduct, net,
      recordedBy: auth.currentUser?.uid || null,
      createdAt: serverTimestamp()
    });
    showToast('Wage entry saved' + (isMachineOps && qty > 0 ? ' & inventory updated' : ''));
    clearWageForm();
    loadWageEntries(); // Refresh the table
  } catch (e) {
    console.error(e);
    showToast('Failed to save entry', 'error');
  }
});

/**
 * Reduce inventory quantity when manager enters Machine Operators wage with an item (e.g. Cotton).
 * Matches inventory by name (case-insensitive). Reduces from first matching item with sufficient quantity.
 * @returns {{ success: boolean, message?: string }}
 */
async function reduceInventoryForMachineOps(itemName, qtyToReduce) {
  if (!itemName || !(qtyToReduce > 0)) return { success: true };

  const searchName = String(itemName).toLowerCase().trim();
  const snap = await getDocs(collection(db, 'inventory'));
  const matches = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((x) => (x.name || '').toLowerCase().trim() === searchName);

  if (matches.length === 0) {
    return { success: false, message: `No inventory found for "${itemName}". Add it first or check spelling.` };
  }

  // Find first item with sufficient quantity
  const candidate = matches.find((x) => {
    const qty = Number(x.quantity);
    return !isNaN(qty) && qty >= qtyToReduce;
  });

  if (!candidate) {
    const total = matches.reduce((sum, x) => sum + (Number(x.quantity) || 0), 0);
    return {
      success: false,
      message: `Insufficient inventory for ${itemName}. Available: ${total} ${matches[0].unit || ''}`,
    };
  }

  const currentQty = Number(candidate.quantity) || 0;
  const newQty = currentQty - qtyToReduce;
  await updateDoc(doc(db, 'inventory', candidate.id), {
    quantity: newQty,
  });
  return { success: true };
}

/**
 * Restore inventory quantity when manager deletes a Machine Operators wage entry.
 * Adds the qty back to the first matching inventory item by name.
 * @returns {{ success: boolean, message?: string }}
 */
async function restoreInventoryForMachineOps(itemName, qtyToRestore) {
  if (!itemName || !(qtyToRestore > 0)) return { success: true };

  const searchName = String(itemName).toLowerCase().trim();
  const snap = await getDocs(collection(db, 'inventory'));
  const matches = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((x) => (x.name || '').toLowerCase().trim() === searchName);

  if (matches.length === 0) {
    return { success: false, message: `No inventory found for "${itemName}" to restore. Wage deleted but inventory not updated.` };
  }

  // Add back to first matching item
  const target = matches[0];
  const currentQty = Number(target.quantity) || 0;
  const newQty = currentQty + qtyToRestore;
  await updateDoc(doc(db, 'inventory', target.id), {
    quantity: newQty,
  });
  return { success: true };
}

async function loadManagerUserNameMap() {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const map = {};
    snap.forEach((d) => {
      const u = d.data() || {};
      const resolved = u.displayName || u.fullName || u.name || u.email || 'Unknown';
      map[d.id] = String(resolved).trim() || 'Unknown';
    });
    managerUserNameByUid = map;
  } catch (err) {
    console.warn('Failed to load user map:', err);
    managerUserNameByUid = {};
  }
}

function resolveUserDisplayName(nameField, uidField) {
  if (nameField && String(nameField).trim()) return String(nameField).trim();
  if (uidField && managerUserNameByUid[uidField]) return managerUserNameByUid[uidField];
  return 'Unknown';
}

function normalizeCategory(value) {
  return String(value || '').trim().toLowerCase();
}

function isProductionInventoryCategory(value) {
  const c = normalizeCategory(value);
  return c === 'production' || c === 'finished product';
}

function populateManagerCategoryFilter(items) {
  if (!managerInventoryCategoryFilterEl) return;
  const current = managerInventoryCategoryFilterEl.value || '';
  const categories = [...new Set(items.map((x) => String(x.category || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  let options = `<option value="">All categories</option>`;
  categories.forEach((c) => {
    options += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
  });
  managerInventoryCategoryFilterEl.innerHTML = options;

  if (current && categories.includes(current)) {
    managerInventoryCategoryFilterEl.value = current;
  }
}

function renderManagerInventoryTable() {
  if (!managerInventoryListEl) return;

  const selectedCategory = managerInventoryCategoryFilterEl?.value || '';
  const visibleItems = selectedCategory
    ? managerInventoryItems.filter((x) => String(x.category || '').trim() === selectedCategory)
    : managerInventoryItems;

  if (!visibleItems.length) {
    managerInventoryListEl.innerHTML = "<p class='empty-msg'>No inventory items for selected category.</p>";
    return;
  }

  let html = `
    <table class="manager-table">
      <thead>
        <tr>
          <th>Barcode/ID</th>
          <th>Name</th>
          <th>Category</th>
          <th>Qty</th>
          <th>Unit</th>
          <th>Vendor</th>
          <th>Vendor contact</th>
          <th>Purchase date</th>
          <th>Expiry date</th>
          <th>Storage area</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  visibleItems.forEach((x) => {
    const qty = x.quantity != null ? x.quantity : '—';
    const numQty = typeof x.quantity === 'number' && !isNaN(x.quantity) ? x.quantity : (typeof qty === 'number' ? qty : null);
    const rowClass = numQty != null
      ? (numQty < 30 ? 'inv-row-low' : numQty < 60 ? 'inv-row-warning' : 'inv-row-ok')
      : '';
    const unit = x.unit || x.units || '—';
    const purchaseDate = x.purchaseDate || '—';
    const expiryDate = x.expiryDate || '—';
    const hideVendor = isProductionInventoryCategory(x.category);

    html += `
      <tr class="${rowClass}">
        <td>${escapeHtml(x.barcode)}</td>
        <td>${escapeHtml(x.name)}</td>
        <td>${escapeHtml(x.category)}</td>
        <td>${qty < 30 ? `<span class="low-stock">${escapeHtml(qty)}</span>` : qty < 60 ? `<span class="warning-stock">${escapeHtml(qty)}</span>` : escapeHtml(qty)}</td>
        <td>${escapeHtml(unit)}</td>
        <td>${escapeHtml(hideVendor ? '—' : (x.vendorName || '—'))}</td>
        <td>${escapeHtml(hideVendor ? '—' : (x.vendorContact || '—'))}</td>
        <td>${escapeHtml(purchaseDate)}</td>
        <td>${escapeHtml(expiryDate)}</td>
        <td>${escapeHtml(x.storageArea || '—')}</td>
        <td>
          <button type="button" class="btn btn-sm btn-outline manager-manage-inventory" data-id="${escapeHtml(x.id)}">Manage</button>
          <div class="manager-inventory-actions" id="manager-inventory-actions-${escapeHtml(x.id)}" style="display:none; margin-top:6px;">
            <button type="button" class="btn btn-sm btn-outline manager-edit-inventory" data-id="${escapeHtml(x.id)}">Edit</button>
            <button type="button" class="btn btn-sm btn-primary manager-delete-inventory" data-id="${escapeHtml(x.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  managerInventoryListEl.innerHTML = html;
}

async function loadManagerInventory() {
  if (!managerInventoryListEl) return;
  managerInventoryListEl.innerHTML = "<p class='loading-msg'>Loading inventory…</p>";
  try {
    const snap = await getDocs(collection(db, 'inventory'));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));

    managerInventoryItems = items;
    populateManagerCategoryFilter(items);

    if (!items.length) {
      managerInventoryListEl.innerHTML = "<p class='empty-msg'>No inventory items yet.</p>";
      return;
    }

    renderManagerInventoryTable();
  } catch (err) {
    console.error(err);
    managerInventoryListEl.innerHTML = `<p class='error'>Failed to load inventory: ${escapeHtml(err.message || err)}</p>`;
  }
}

async function loadManagerDamageReports() {
  if (!managerDamageReportsListEl) return;
  managerDamageReportsListEl.innerHTML = "<p class='loading-msg'>Loading damage reports…</p>";
  try {
    const snap = await getDocs(collection(db, 'problem_reports'));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.reportedAt?.toMillis?.() ?? 0) - (a.reportedAt?.toMillis?.() ?? 0));

    if (!items.length) {
      managerDamageReportsListEl.innerHTML = "<p class='empty-msg'>No damage reports yet.</p>";
      return;
    }

    let html = `
      <table class="manager-table">
        <thead>
          <tr>
            <th>Barcode/ID</th>
            <th>Product name</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Explanation</th>
            <th>Reported at</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    items.forEach((x) => {
      let reportedAt = '—';
      if (x.reportedAt?.toDate) {
        try {
          reportedAt = x.reportedAt.toDate().toLocaleString();
        } catch (_) {}
      }
      const qty = x.quantity != null ? x.quantity : '—';
      const unit = x.unit || x.units || '—';

      html += `
        <tr>
          <td>${escapeHtml(x.barcode)}</td>
          <td>${escapeHtml(x.name)}</td>
          <td>${escapeHtml(qty)}</td>
          <td>${escapeHtml(unit)}</td>
          <td>${escapeHtml(x.explanation)}</td>
          <td>${escapeHtml(reportedAt)}</td>
          <td>
            <button type="button" class="btn btn-sm btn-outline manager-edit-damage" data-id="${escapeHtml(x.id)}">Edit</button>
            <button type="button" class="btn btn-sm btn-primary manager-delete-damage" data-id="${escapeHtml(x.id)}">Delete</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    managerDamageReportsListEl.innerHTML = html;
  } catch (err) {
    console.error(err);
    managerDamageReportsListEl.innerHTML = `<p class='error'>Failed to load damage reports: ${escapeHtml(err.message || err)}</p>`;
  }
}

// ─── Orders Management ───
let managerOrders = [];

// Reduce inventory when approving orders
async function reduceInventoryForOrder(order) {
  const { productBarcode, productName, quantity } = order;
  if (!productBarcode || !productName || !(Number(quantity) > 0)) {
    return { success: false, message: 'Invalid order data' };
  }

  const searchBarcode = String(productBarcode).toLowerCase().trim();
  const searchName = String(productName).toLowerCase().trim();

  try {
    const snap = await getDocs(collection(db, 'inventory'));
    const candidates = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((inv) => inv.category === 'finished product' &&
        ((inv.barcode || '').toLowerCase().trim() === searchBarcode ||
         (inv.name || '').toLowerCase().trim() === searchName));

    if (candidates.length === 0) {
      return { success: false, message: `No inventory: "${productName}" (${productBarcode})` };
    }

    const target = candidates.find((inv) => {
      const invQty = Number(inv.quantity);
      return !isNaN(invQty) && invQty >= Number(quantity);
    });

    if (!target) {
      const totalAvail = candidates.reduce((sum, inv) => sum + (Number(inv.quantity) || 0), 0);
      return { success: false, message: `Insufficient stock (${totalAvail} available)` };
    }

    const currentQty = Number(target.quantity) || 0;
    const newQty = currentQty - Number(quantity);
    await updateDoc(doc(db, 'inventory', target.id), { quantity: newQty });
    
    console.log(`✅ Reduced: ${productName} qty ${quantity} → ${newQty}`);
    return { success: true };
  } catch (err) {
    console.error('Inventory error:', err);
    return { success: false, message: err.message };
  }
}

async function loadManagerOrders() {
  const ordersListEl = document.getElementById('managerOrdersList');
  if (!ordersListEl) return;
  
  ordersListEl.innerHTML = "<p class='loading-msg'>Loading orders…</p>";
  
  try {
    const snap = await getDocs(collection(db, 'orders'));
    managerOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    managerOrders.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    
    if (!managerOrders.length) {
      ordersListEl.innerHTML = "<p class='empty-msg'>No orders yet.</p>";
      return;
    }
    
    renderManagerOrdersTable();
  } catch (err) {
    console.error(err);
    ordersListEl.innerHTML = `<p class='error'>Failed to load orders: ${escapeHtml(err.message || err)}</p>`;
  }
}

function renderManagerOrdersTable() {
  const ordersListEl = document.getElementById('managerOrdersList');
  const statusFilter = document.getElementById('orderStatusFilter')?.value || '';
  const searchQuery = (document.getElementById('orderSearchQuery')?.value || '').trim().toLowerCase();
  if (!ordersListEl) return;
  
  let filteredOrders = statusFilter
    ? managerOrders.filter(o => o.status === statusFilter)
    : managerOrders;

  if (searchQuery) {
    filteredOrders = filteredOrders.filter((o) => {
      const phone = String(o.supplierContact || '').toLowerCase();
      const supplier = String(o.supplierName || '').toLowerCase();
      return phone.includes(searchQuery) || supplier.includes(searchQuery);
    });
  }
  
  if (!filteredOrders.length) {
    ordersListEl.innerHTML = "<p class='empty-msg'>No orders match the filter or search.</p>";
    return;
  }
  
  let html = `
    <table class="manager-table">
      <thead>
        <tr>
          <th>Employee</th>
          <th>Product</th>
          <th>Barcode</th>
          <th>Qty</th>
          <th>Unit</th>
          <th>Category</th>
          <th>Supplier</th>
          <th>Phone</th>
          <th>Delivery Addr</th>
          <th>Status</th>
          <th>Date</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  filteredOrders.forEach((order) => {
    let createdAt = '—';
    if (order.createdAt?.toDate) {
      try {
        createdAt = order.createdAt.toDate().toLocaleDateString();
      } catch (_) {}
    }
    
    const statusClass = order.status === 'pending' ? 'status-pending' : 
                       order.status === 'approved' ? 'status-approved' : 'status-rejected';
    
    html += `
      <tr>
        <td>${escapeHtml(order.employeeName || 'Unknown')}</td>
        <td>${escapeHtml(order.productName)}</td>
        <td>${escapeHtml(order.productBarcode)}</td>
        <td>${escapeHtml(order.quantity)}</td>
        <td>${escapeHtml(order.unit)}</td>
        <td>${escapeHtml(order.category)}</td>
        <td>${escapeHtml(order.supplierName || '—')}</td>
        <td>${escapeHtml(order.supplierContact || '—')}</td>
        <td title="${escapeHtml(order.deliveryAddress || '')}">${escapeHtml((order.deliveryAddress || '').length > 30 ? (order.deliveryAddress || '').substring(0, 30) + '...' : (order.deliveryAddress || '—'))}</td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(order.status?.toUpperCase() || '—')}</span></td>
        <td>${escapeHtml(createdAt)}</td>
        <td>
          <button type="button" class="btn btn-sm btn-outline order-manage-toggle" data-id="${escapeHtml(order.id)}">Manage</button>
          <div class="order-row-actions" id="order-actions-${escapeHtml(order.id)}" style="display:none; margin-top:6px;">
            <button type="button" class="btn btn-sm btn-success order-set-approved" data-id="${escapeHtml(order.id)}">Approved</button>
            <button type="button" class="btn btn-sm btn-warning order-set-pending" data-id="${escapeHtml(order.id)}">Pending</button>
            <button type="button" class="btn btn-sm btn-danger order-set-rejected" data-id="${escapeHtml(order.id)}">Rejected</button>
           
            <button type="button" class="btn btn-sm btn-primary order-delete" data-id="${escapeHtml(order.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  ordersListEl.innerHTML = html;
}

// Order actions
async function restoreInventoryForOrder(order) {
  const { productBarcode, productName, quantity } = order;
  if (!productBarcode || !productName || !(Number(quantity) > 0)) {
    return { success: true };
  }

  const searchBarcode = String(productBarcode).toLowerCase().trim();
  const searchName = String(productName).toLowerCase().trim();

  try {
    const snap = await getDocs(collection(db, 'inventory'));
    const candidates = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((inv) => inv.category === 'finished product' &&
        ((inv.barcode || '').toLowerCase().trim() === searchBarcode ||
         (inv.name || '').toLowerCase().trim() === searchName));

    if (candidates.length === 0) {
      return { success: false, message: `No inventory: "${productName}" (${productBarcode}) to restore` };
    }

    // Add back to first matching item
    const target = candidates[0];
    const currentQty = Number(target.quantity) || 0;
    const newQty = currentQty + Number(quantity);
    await updateDoc(doc(db, 'inventory', target.id), { quantity: newQty });
    
    console.log(`✅ Restored: ${productName} qty ${quantity} → ${newQty}`);
    return { success: true };
  } catch (err) {
    console.error('Inventory restore error:', err);
    return { success: false, message: err.message };
  }
}

document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('order-approve')) {
    const orderId = e.target.dataset.id;
    if (!confirm('Approve this order?\n\n⚠️ This will reduce inventory quantity!')) return;
    
    try {
      // Get order details first
      const orderDoc = await getDoc(doc(db, 'orders', orderId));
      const order = orderDoc.data();
      if (!order) throw new Error('Order not found');
      
      // Reduce inventory qty for the ordered product
      const reduceResult = await reduceInventoryForOrder(order);
      if (!reduceResult.success) {
        showToast(reduceResult.message + '\nOrder approved anyway', 'warning');
      } else {
        showToast('✅ Inventory reduced → Order approved');
      }
      
      // Update order status
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'approved',
        approvedBy: auth.currentUser?.uid,
        approvedByName: auth.currentUser?.displayName || auth.currentUser?.email || 'Manager',
        approvedAt: serverTimestamp()
      });
      
      await loadManagerOrders();
      await loadManagerInventory();  // Refresh inventory table
    } catch (err) {
      console.error(err);
      showToast('Failed to approve order: ' + err.message, 'error');
    }
  }
  
  if (e.target.classList.contains('order-reject')) {
    const reason = prompt('Rejection reason (optional):');
    if (!confirm(`Reject this order${reason ? ` - Reason: ${reason}` : ''}?`)) return;
    
    const orderId = e.target.dataset.id;
    
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'rejected',
        rejectionReason: reason?.trim() || null,
        approvedBy: auth.currentUser?.uid,
        approvedByName: auth.currentUser?.displayName || auth.currentUser?.email || 'Manager',
        approvedAt: serverTimestamp()
      });
      showToast('❌ Order rejected');
      await loadManagerOrders();
    } catch (err) {
      console.error(err);
      showToast('Failed to reject order', 'error');
    }
    return;
  }

  if (e.target.classList.contains('order-manage-toggle')) {
    const orderId = e.target.dataset.id;
    const panel = document.getElementById(`order-actions-${orderId}`);
    if (!panel) {
      console.error('No panel found for orderId:', orderId);
      return;
    }
    const willShow = panel.style.display === 'none';
    document.querySelectorAll('.order-row-actions').forEach((el) => {
      el.style.display = 'none';
    });
    panel.style.display = willShow ? 'block' : 'none';
    console.log('Toggle panel for', orderId, 'show:', willShow);
    return;
  }

  if (e.target.classList.contains('order-set-approved')) {
    const orderId = e.target.dataset.id;
    if (!confirm('Set to Approved? (Reduces inventory)')) return;
    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    const order = orderSnap.data();
    const result = await reduceInventoryForOrder(order);
    await updateDoc(doc(db, 'orders', orderId), { status: 'approved' });
    showToast('Status: Approved' + (result.success ? ' + inventory reduced' : ''));
    loadManagerOrders();
    return;
  }

  if (e.target.classList.contains('order-set-pending')) {
    const orderId = e.target.dataset.id;
    await updateDoc(doc(db, 'orders', orderId), { status: 'pending' });
    showToast('Status: Pending');
    loadManagerOrders();
    return;
  }

  if (e.target.classList.contains('order-set-rejected')) {
    const orderId = e.target.dataset.id;
    const reason = prompt('Rejection reason:');
    await updateDoc(doc(db, 'orders', orderId), { status: 'rejected', rejectionReason: reason || null });
    showToast('Status: Rejected');
    loadManagerOrders();
    return;
  }

  if (e.target.classList.contains('order-edit')) {
    const orderId = e.target.dataset.id;
    // Fetch order data
    try {
      const orderSnap = await getDoc(doc(db, 'orders', orderId));
      const order = orderSnap.data();
      if (!order) return;
      
      const productName = prompt('Product name:', order.productName || '');
      if (productName === null) return;
      const quantityRaw = prompt('Quantity:', order.quantity != null ? String(order.quantity) : '');
      if (quantityRaw === null) return;
      const unit = prompt('Unit:', order.unit || '');
      if (unit === null) return;
      
      const quantity = Number(quantityRaw);
      if (Number.isNaN(quantity) || quantity <= 0) {
        showToast('Invalid quantity', 'error');
        return;
      }
      
      await updateDoc(doc(db, 'orders', orderId), {
        productName: productName.trim(),
        quantity,
        unit: unit.trim() || null
      });
      showToast('Order updated');
      await loadManagerOrders();
    } catch (err) {
      console.error(err);
      showToast('Failed to edit order', 'error');
    }
    return;
  }

  if (e.target.classList.contains('order-delete')) {
    const orderId = e.target.dataset.id;
    if (!confirm('Delete this order permanently?\\n\\n⚠️ Inventory will be restored if previously approved.')) return;
    
    try {
      // Fetch order details for inventory restore
      const orderSnap = await getDoc(doc(db, 'orders', orderId));
      const order = orderSnap.data();
      if (!order) throw new Error('Order not found');
      
      let restoreSuccess = true;
      if (order.status === 'approved') {
        const restoreResult = await restoreInventoryForOrder(order);
        restoreSuccess = restoreResult.success;
        if (!restoreSuccess) {
          showToast(restoreResult.message + '\\nOrder deleted anyway.', 'warning');
        }
      }
      
      await deleteDoc(doc(db, 'orders', orderId));
      
      const msg = restoreSuccess ? 'Order deleted' + (order.status === 'approved' ? ' & inventory restored' : '') : 'Order deleted';
      showToast(msg);
      await loadManagerOrders();
    } catch (err) {
      console.error(err);
      showToast('Failed to delete order: ' + err.message, 'error');
    }
    return;
  }
});

if (document.getElementById('orderStatusFilter')) {
  document.getElementById('orderStatusFilter').addEventListener('change', renderManagerOrdersTable);
}
if (document.getElementById('orderSearchQuery')) {
  document.getElementById('orderSearchQuery').addEventListener('input', renderManagerOrdersTable);
}

if (managerInventoryCategoryFilterEl) {
  managerInventoryCategoryFilterEl.addEventListener('change', renderManagerInventoryTable);
}

if (managerInventoryListEl) {
  managerInventoryListEl.addEventListener('click', async (e) => {
    const manageBtn = e.target.closest('.manager-manage-inventory');
    const editBtn = e.target.closest('.manager-edit-inventory');
    const delBtn = e.target.closest('.manager-delete-inventory');

    if (manageBtn) {
      const id = manageBtn.getAttribute('data-id');
      const panel = document.getElementById(`manager-inventory-actions-${id}`);
      if (!panel) return;
      const willShow = panel.style.display === 'none';
      managerInventoryListEl.querySelectorAll('.manager-inventory-actions').forEach((el) => {
        el.style.display = 'none';
      });
      panel.style.display = willShow ? 'block' : 'none';
      return;
    }

    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      const item = managerInventoryItems.find((x) => x.id === id);
      if (!item) return;

      const name = prompt('Name:', item.name || '');
      if (name === null) return;
      const category = prompt('Category:', item.category || '');
      if (category === null) return;
      const quantityRaw = prompt('Quantity:', item.quantity != null ? String(item.quantity) : '');
      if (quantityRaw === null) return;
      const unit = prompt('Unit:', item.unit || '');
      if (unit === null) return;
      const vendorName = prompt('Vendor name:', item.vendorName || '');
      if (vendorName === null) return;
      const vendorContact = prompt('Vendor contact:', item.vendorContact || '');
      if (vendorContact === null) return;
      const purchaseDate = prompt('Purchase date (YYYY-MM-DD):', item.purchaseDate || '');
      if (purchaseDate === null) return;
      const expiryDate = prompt('Expiry date (YYYY-MM-DD):', item.expiryDate || '');
      if (expiryDate === null) return;
      const storageArea = prompt('Storage area:', item.storageArea || '');
      if (storageArea === null) return;

      const quantity = quantityRaw.trim() === '' ? null : Number(quantityRaw);
      if (quantityRaw.trim() !== '' && Number.isNaN(quantity)) {
        showToast('Invalid quantity', 'error');
        return;
      }

      try {
        await updateDoc(doc(db, 'inventory', id), {
          name: name.trim(),
          category: category.trim(),
          quantity,
          unit: unit.trim() || null,
          vendorName: vendorName.trim() || null,
          vendorContact: vendorContact.trim() || null,
          purchaseDate: purchaseDate.trim() || null,
          expiryDate: expiryDate.trim() || null,
          storageArea: storageArea.trim() || null
        });
        showToast('Inventory updated');
        await loadManagerInventory();
      } catch (err) {
        console.error(err);
        showToast('Failed to update inventory', 'error');
      }
    }

    if (delBtn) {
      const id = delBtn.getAttribute('data-id');
      if (!confirm('Delete this inventory item permanently?')) return;

      try {
        await deleteDoc(doc(db, 'inventory', id));
        showToast('Inventory deleted');
        await loadManagerInventory();
      } catch (err) {
        console.error(err);
        showToast('Failed to delete inventory', 'error');
      }
    }
  });
}

if (managerDamageReportsListEl) {
  managerDamageReportsListEl.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.manager-edit-damage');
    const delBtn = e.target.closest('.manager-delete-damage');

    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      try {
        const snap = await getDocs(collection(db, 'problem_reports'));
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const report = items.find((x) => x.id === id);
        if (!report) return;

        const name = prompt('Product name:', report.name || '');
        if (name === null) return;
        const quantityRaw = prompt('Quantity:', report.quantity != null ? String(report.quantity) : '');
        if (quantityRaw === null) return;
        const unit = prompt('Unit:', report.unit || '');
        if (unit === null) return;
        const explanation = prompt('Explanation:', report.explanation || '');
        if (explanation === null) return;

        const quantity = quantityRaw.trim() === '' ? null : Number(quantityRaw);
        if (quantityRaw.trim() !== '' && Number.isNaN(quantity)) {
          showToast('Invalid quantity', 'error');
          return;
        }

        await updateDoc(doc(db, 'problem_reports', id), {
          name: name.trim(),
          quantity,
          unit: unit.trim() || null,
          explanation: explanation.trim()
        });
        showToast('Damage report updated');
        await loadManagerDamageReports();
      } catch (err) {
        console.error(err);
        showToast('Failed to update damage report', 'error');
      }
    }

    if (delBtn) {
      const id = delBtn.getAttribute('data-id');
      if (!confirm('Delete this damage report permanently?')) return;

      try {
        await deleteDoc(doc(db, 'problem_reports', id));
        showToast('Damage report deleted');
        await loadManagerDamageReports();
      } catch (err) {
        console.error(err);
        showToast('Failed to delete damage report', 'error');
      }
    }
  });
}

function clearWageForm() {
  inpEmployee.value = '';
  inpEmployeeId.value = '';
  inpDate.value = '';
  selDept.value = '';
  selItem.innerHTML = '<option value="">Select item</option>';
  inpQty.value = '0';
  inpUnit.value = '';
  inpRate.value = '';
  inpOT.value = '0';
  inpBonus.value = '0';
  inpDeduct.value = '0';
}
btnClear.addEventListener('click', clearWageForm);

if (tblWageEntriesBody) {
  tblWageEntriesBody.addEventListener('click', async (e) => {
    const manageBtn = e.target.closest('.wage-manage-toggle');
    const editBtn = e.target.closest('.wage-edit');
    const delBtn = e.target.closest('.wage-delete');

    if (manageBtn) {
      const id = manageBtn.getAttribute('data-id');
      const panel = document.getElementById(`wage-actions-${id}`);
      if (!panel) return;
      const willShow = panel.style.display === 'none';
      tblWageEntriesBody.querySelectorAll('.wage-row-actions').forEach((el) => {
        el.style.display = 'none';
      });
      panel.style.display = willShow ? 'block' : 'none';
      return;
    }

    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      try {
        const snap = await getDocs(collection(db, 'wageEntries'));
        const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const row = entries.find((x) => x.id === id);
        if (!row) return;

        const qtyRaw = prompt('Quantity:', row.qty != null ? String(row.qty) : '0');
        if (qtyRaw === null) return;
        const unit = prompt('Unit:', row.unit || '');
        if (unit === null) return;
        const otRaw = prompt('Overtime hours:', row.ot != null ? String(row.ot) : '0');
        if (otRaw === null) return;
        const bonusRaw = prompt('Bonus:', row.bonus != null ? String(row.bonus) : '0');
        if (bonusRaw === null) return;
        const deductRaw = prompt('Deduction:', row.deduct != null ? String(row.deduct) : '0');
        if (deductRaw === null) return;

        const qty = Number(qtyRaw);
        const ot = Number(otRaw);
        const bonus = Number(bonusRaw);
        const deduct = Number(deductRaw);
        const rate = Number(row.rate) || 0;

        if ([qty, ot, bonus, deduct].some(Number.isNaN) || qty < 0) {
          showToast('Invalid numeric input', 'error');
          return;
        }

        const oldQty = Number(row.qty) || 0;
        const delta = qty - oldQty;

        // Sync inventory with wage qty change:
        // delta > 0 => consume more inventory (decrease inventory)
        // delta < 0 => consume less inventory (increase inventory)
        const wageItemName = String(row.item || '').trim().toLowerCase();
        if (wageItemName) {
          const invSnap = await getDocs(collection(db, 'inventory'));
          const invMatch = invSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .find((inv) => String(inv.name || '').trim().toLowerCase() === wageItemName);

          if (invMatch && delta !== 0) {
            const currentInvQty = Number(invMatch.quantity) || 0;
            const updatedInvQty = currentInvQty - delta;
            if (updatedInvQty < 0) {
              showToast('Not enough inventory for increased quantity', 'error');
              return;
            }
            await updateDoc(doc(db, 'inventory', invMatch.id), {
              quantity: updatedInvQty
            });
          }
        }

        const wages = qty * rate;
        const otPay = ot * (rate / 8) * 1.5;
        const net = wages + otPay + bonus - deduct;

        await updateDoc(doc(db, 'wageEntries', id), {
          qty,
          unit: unit.trim() || null,
          wages,
          ot,
          otPay,
          bonus,
          deduct,
          net
        });

        showToast('Wage entry updated');
        await Promise.all([loadWageEntries(), loadManagerInventory()]);
      } catch (err) {
        console.error(err);
        showToast('Failed to update wage entry', 'error');
      }
      return;
    }

    if (delBtn) {
      const id = delBtn.getAttribute('data-id');
      if (!confirm('Delete this wage entry permanently?')) return;
      try {
        // Fetch wage entry to check if we need to restore inventory (Machine Operators)
        const wageSnap = await getDoc(doc(db, 'wageEntries', id));
        const wageData = wageSnap.exists() ? wageSnap.data() : null;
        const isMachineOps = wageData && (wageData.department || '').toLowerCase().includes('machine');
        const item = (wageData?.item || '').trim();
        const qty = Number(wageData?.qty) || 0;

        let restoreSuccess = true;
        if (isMachineOps && item && qty > 0) {
          const restoreResult = await restoreInventoryForMachineOps(item, qty);
          restoreSuccess = restoreResult.success;
        }

        await deleteDoc(doc(db, 'wageEntries', id));

        if (isMachineOps && item && qty > 0) {
          showToast(restoreSuccess ? 'Wage deleted & inventory restored' : `Wage deleted. ${item} not found in inventory to restore.`);
        } else {
          showToast('Wage entry deleted');
        }
        await loadWageEntries();
      } catch (err) {
        console.error(err);
        showToast('Failed to delete wage entry', 'error');
      }
    }
  });
}

// payslip summary
async function getMonthlySummary(empId, monthName) {
  const employeesSnap = await getDocs(collection(db, 'employees'));
  const employeeDoc = employeesSnap.docs.find(d => d.id === empId);
  const employee = employeeDoc ? employeeDoc.data() : null;
  if (!employee) return null;

  const wageSnap = await getDocs(collection(db, 'wageEntries'));
  let totalW = 0, totalOT = 0, totalBonus = 0, totalDeduct = 0;
  wageSnap.forEach(d => {
    const entry = d.data();
    if (entry.employeeId === empId) {
      const entryMonth = new Date(entry.date).toLocaleString('default', { month: 'long' });
      if (entryMonth === monthName) {
        totalW += entry.wages || entry.totalWage || 0;
        totalOT += entry.otPay || 0;
        totalBonus += entry.bonus || 0;
        totalDeduct += entry.deduct || 0;
      }
    }
  });

  return {
    name: employee.fullName || employee.name || employee.email || 'Unknown',
    wages: totalW,
    otPay: totalOT,
    bonus: totalBonus,
    deduct: totalDeduct,
    net: totalW + totalOT + totalBonus - totalDeduct
  };
}

btnPreviewSlip.addEventListener('click', async () => {
  const empId = selSlipEmployee.value;
  const month = selSlipMonth.value;
  if (!empId || !month) { showToast('Select employee and month','error'); return; }
  const summary = await getMonthlySummary(empId, month);
  if (!summary || summary.net === 0) { showToast('No wage data for this month','error'); return; }
  document.getElementById('summary-month').textContent = month;
  document.getElementById('summary-content').innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div><strong>Employee:</strong> ${summary.name}</div>
      <div><strong>Month:</strong> ${month}</div>
      <div><strong>Wages:</strong> Rs. ${summary.wages.toLocaleString()}</div>
      <div><strong>Overtime:</strong> Rs. ${summary.otPay.toLocaleString()}</div>
      <div><strong>Bonus:</strong> Rs. ${summary.bonus.toLocaleString()}</div>
      <div><strong>Deduction:</strong> Rs. ${summary.deduct.toLocaleString()}</div>
      <div style="grid-column:1/-1; height:1px; background:#eee; margin:8px 0;"></div>
      <div style="grid-column:1/-1; font-weight:700;">Net Pay: Rs. ${summary.net.toLocaleString()}</div>
    </div>
  `;
  document.getElementById('slip-summary').style.display = 'block';
});

btnDownloadSlip.addEventListener('click', async () => {
  const empId = selSlipEmployee.value;
  const month = selSlipMonth.value;
  if (!empId || !month) { showToast('Select employee and month','error'); return; }
  const summary = await getMonthlySummary(empId, month);
  if (!summary || summary.net === 0) { showToast('No wage data to generate', 'error'); return; }

  if (!window.jspdf) { showToast('PDF library not loaded', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('Kathmandu Textile Industry', 105, 30, { align: 'center' });
  doc.setFontSize(14);
  doc.text(`Payslip — ${month}`, 105, 48, { align: 'center' });

  doc.autoTable({
    startY: 70,
    head: [['Description','Amount (Rs)']],
    body: [
      ['Basic Wages', summary.wages.toLocaleString()],
      ['Overtime Pay', summary.otPay.toLocaleString()],
      ['Bonus', summary.bonus.toLocaleString()],
      ['Deductions', `-${summary.deduct.toLocaleString()}`],
      ['NET PAY', summary.net.toLocaleString()]
    ],
    theme: 'grid'
  });
  doc.save(`payslip_${empId.replace(/\s+/g,'_')}_${month}.pdf`);
});

// Share functionality
function getMonthlySummaryText(summary, month) {
  if (!summary) return '';
  return `
    Payslip Summary - ${month}
    ---------------------------
    Employee: ${summary.name}
    Month: ${month}
    ---------------------------
    Basic Wages: Rs. ${summary.wages.toLocaleString()}
    Overtime: Rs. ${summary.otPay.toLocaleString()}
    Bonus: Rs. ${summary.bonus.toLocaleString()}
    Deduction: Rs. ${summary.deduct.toLocaleString()}
    ---------------------------
    Net Pay: Rs. ${summary.net.toLocaleString()}
    ---------------------------
  `.trim().replace(/    /g, '');
}

async function shareViaEmail() {
  const empId = selSlipEmployee.value;
  const month = selSlipMonth.value;
  if (!empId || !month) {
    showToast('Select employee and month', 'error');
    return;
  }

  const employee = employees.find(e => e.id === empId);
  if (!employee || !employee.email) {
    showToast('Employee email not available', 'error');
    return;
  }

  const summary = await getMonthlySummary(empId, month);
  if (!summary || summary.net === 0) {
    showToast('No wage data to share', 'error');
    return;
  }

  const payslipText = getMonthlySummaryText(summary, month);
  const subject = `Payslip for ${month}`;
  const body = encodeURIComponent(payslipText);
  window.location.href = `mailto:${employee.email}?subject=${subject}&body=${body}`;
}

async function shareViaWhatsApp() {
  const empId = selSlipEmployee.value;
  const month = selSlipMonth.value;
  if (!empId || !month) {
    showToast('Select employee and month', 'error');
    return;
  }

  const employee = employees.find(e => e.id === empId);
  if (!employee || !employee.phone) {
    showToast('Employee phone number not available', 'error');
    return;
  }

  const summary = await getMonthlySummary(empId, month);
  if (!summary || summary.net === 0) {
    showToast('No wage data to share', 'error');
    return;
  }

  const payslipText = getMonthlySummaryText(summary, month);
  const encodedText = encodeURIComponent(payslipText);
  // a regex to remove all non-digit characters from the phone number
  const phone = employee.phone.replace(/\D/g, '');
  window.open(`https://wa.me/${phone}?text=${encodedText}`, '_blank');
}


if (btnShareSlip) {
  btnShareSlip.addEventListener('click', () => {
    if (shareModal) shareModal.style.display = 'flex';
  });
}

if (btnCancelShare) {
  btnCancelShare.addEventListener('click', () => {
    if (shareModal) shareModal.style.display = 'none';
  });
}

if(modalCloseShare) {
  modalCloseShare.addEventListener('click', () => {
    if (shareModal) shareModal.style.display = 'none';
  });
}

if (btnShareEmail) {
  btnShareEmail.addEventListener('click', shareViaEmail);
}

if (btnShareWhatsApp) {
  btnShareWhatsApp.addEventListener('click', shareViaWhatsApp);
}


// init
(async function(){
  await Promise.all([loadEmployees(), loadRates(), loadManagerUserNameMap()]);
  // set default date
  if (inpDate) inpDate.valueAsDate = new Date();
  // Load wage entries table
  loadWageEntries();
})();
