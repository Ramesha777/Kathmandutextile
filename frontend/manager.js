// manager.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// caches
let employees = [];
let rates = { machine: [], production: [], daily: [] };

//
const toastEl = document.getElementById('toast');
const logoutBtn = document.getElementById('logoutBtn');
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

if (logoutBtn) logoutBtn.addEventListener('click', async () => {
  try { await signOut(auth); window.location.replace("login.html"); } catch (e) { console.error(e); }
});

// nav
navItems.forEach(it => {
  it.addEventListener('click', () => {
    navItems.forEach(x => x.classList.remove('active'));
    it.classList.add('active');
    document.querySelectorAll('.manager-panel').forEach(panel => panel.classList.remove('active'));
    const section = it.dataset.section;
    document.getElementById('panel-' + section).classList.add('active');
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
      tblWageEntriesBody.innerHTML = '<tr><td colspan="13" style="text-align:center;">No wage entries yet</td></tr>';
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
        </tr>
      `;
    });
    tblWageEntriesBody.innerHTML = html;
  } catch (err) {
    console.error('Failed to load wage entries:', err);
    if (tblWageEntriesBody) {
      tblWageEntriesBody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:red;">Failed to load wage entries</td></tr>';
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
    showToast('Wage entry saved');
    clearWageForm();
    loadWageEntries(); // Refresh the table
  } catch (e) {
    console.error(e);
    showToast('Failed to save entry', 'error');
  }
});

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

// init
(async function(){
  await Promise.all([loadEmployees(), loadRates()]);
  // set default date
  if (inpDate) inpDate.valueAsDate = new Date();
  // Load wage entries table
  loadWageEntries();
})();
