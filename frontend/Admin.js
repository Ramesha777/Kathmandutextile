// admin.js – Admin dashboard: add/remove employees, change roles (Firebase Auth + Firestore)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ROLES = ["admin", "Manager", "employee"];

// DOM
const addUserForm = document.getElementById("addUserForm");
const addEmployeeInfoForm = document.getElementById("addEmployeeInfoForm");
const userListEl = document.getElementById("userList");
const employeeRecordsListEl = document.getElementById("employeeRecordsList");
const adminMessage = document.getElementById("adminMessage");
const logoutBtn = document.getElementById("logoutBtn");

let allEmployeesData = [];
let allUsersData = [];
let currentEmployeeDeptFilter = "";
let currentViewMode = "table"; // "table" or "single"
let currentEmployeeIndex = 0;  // Index for single view navigation
let editingEmployeeId = null;
let modalConfirmCallback = null;

function showMessage(text, isError = false) {
  if (!adminMessage) return;
  adminMessage.textContent = text;
  adminMessage.className = "admin-message " + (isError ? "error" : "success");
  adminMessage.style.display = "block";
  setTimeout(() => {
    adminMessage.style.display = "none";
  }, 5000);
}

function hideMessage() {
  if (adminMessage) adminMessage.style.display = "none";
}

async function loadUsers() {
  if (!userListEl) return;
  userListEl.innerHTML = "<p class='loading-msg'>Loading users…</p>";
  try {
    const snap = await getDocs(collection(db, "users"));
    allUsersData = [];
    snap.forEach((d) => {
      allUsersData.push({ uid: d.id, ...d.data() });
    });
    allUsersData.sort((a, b) => (a.email || a.uid || "").localeCompare(b.email || b.uid || ""));
    renderUserTable(allUsersData);
  } catch (err) {
    userListEl.innerHTML = "<p class='error'>Failed to load users: " + (err.message || err) + "</p>";
  }
}

function renderUserTable(users) {
  const currentUid = auth.currentUser?.uid;
  if (users.length === 0) {
    userListEl.innerHTML = "<p class='empty-msg'>No users in database yet.</p>";
    return;
  }
  let html = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Email</th>
          <th>Role</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (const u of users) {
    const email = u.email || u.uid || "—";
    const role = (u.role || "employee").trim();
    const isSelf = u.uid === currentUid;
    html += `
      <tr data-uid="${u.uid}">
        <td>${escapeHtml(email)}</td>
        <td>
          <select class="role-select" data-uid="${u.uid}" ${isSelf ? "disabled" : ""}>
            ${ROLES.map((r) => `<option value="${r}" ${r === role ? "selected" : ""}>${r}</option>`).join("")}
          </select>
        </td>
        <td>
          <button type="button" class="btn btn-sm btn-danger btn-remove" data-uid="${u.uid}" ${isSelf ? "disabled title='Cannot remove yourself'" : ""}>Remove</button>
        </td>
      </tr>
    `;
  }
  html += "</tbody></table>";
  userListEl.innerHTML = html;

  userListEl.querySelectorAll(".role-select").forEach((sel) => {
    if (sel.disabled) return;
    sel.addEventListener("change", () => updateRole(sel.dataset.uid, sel.value));
  });
  userListEl.querySelectorAll(".btn-remove").forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener("click", () => removeUser(btn.dataset.uid));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function updateRole(uid, newRole) {
  if (!ROLES.includes(newRole)) return;
  hideMessage();
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : {};
    await setDoc(ref, { ...existing, role: newRole }, { merge: true });
    showMessage("Role updated to " + newRole);
    loadUsers();
  } catch (err) {
    showMessage("Failed to update role: " + (err.message || err), true);
  }
}

function removeUser(uid) {
  showModal(
    "Remove User",
    "Remove this user from the app? They will no longer be able to sign in. (Their Firebase Auth account will remain until removed via Firebase Console or backend.)",
    async () => {
      hideMessage();
      try {
        await deleteDoc(doc(db, "users", uid));
        showMessage("User removed from database.");
        loadUsers();
      } catch (err) {
        showMessage("Failed to remove user: " + (err.message || err), true);
      }
    }
  );
}

async function addUser(email, password, role) {
  hideMessage();
  if (!email || !password || !role) {
    showMessage("Please fill email, password, and role.", true);
    return;
  }
  if (!ROLES.includes(role)) {
    showMessage("Invalid role.", true);
    return;
  }
  const submitBtn = addUserForm?.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating…";
  }
  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", userCred.user.uid), {
      email: email.trim(),
      role: role
    });
    await signOut(auth);
    window.location.replace("login.html?msg=User+created.+Please+sign+in+again.");
    return;
  } catch (err) {
    let msg = err.message || "Failed to create user.";
    if (err.code === "auth/email-already-in-use") msg = "This email is already registered.";
    else if (err.code === "auth/weak-password") msg = "Password should be at least 6 characters.";
    showMessage(msg, true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Add user (grant access)";
    }
  }
}

// ─── Validation helpers ───
function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhone(phone) {
  if (!phone || typeof phone !== "string") return false;
  // Accept phone numbers with 7-15 digits, optionally with +, -, (), spaces
  const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ""));
}

function isValidIdNumber(idNumber) {
  // Basic validation: at least 5 characters, alphanumeric
  if (!idNumber || typeof idNumber !== "string") return false;
  return idNumber.length >= 5 && /^[a-zA-Z0-9]+$/.test(idNumber);
}

function isValidUrl(url) {
  // Validate URL: allow https://, http://, and data:image/*
  if (!url || typeof url !== "string") return false;
  try {
    const urlObj = new URL(url);
    const allowedProtocols = ["https:", "http:", "data:"];
    const isAllowedProtocol = allowedProtocols.some(proto => urlObj.href.startsWith(proto));
    if (!isAllowedProtocol) return false;
    // For data URLs, ensure they start with data:image/
    if (urlObj.href.startsWith("data:")) {
      return urlObj.href.startsWith("data:image/");
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Add employee info only (no login) — stored in employees collection
async function addEmployeeInfo() {
  hideMessage();
  const fullName = document.getElementById("empFullName")?.value?.trim();
  if (!fullName) {
    showMessage("Please enter full name.", true);
    return;
  }
  const phone = document.getElementById("empPhone")?.value?.trim() || null;
  const email = document.getElementById("empEmail")?.value?.trim() || null;
  const department = document.getElementById("empDepartment")?.value?.trim() || null;
  const address = document.getElementById("empAddress")?.value?.trim() || null;
  const bankName = document.getElementById("empBankName")?.value?.trim() || null;
  const bankAccountNumber = document.getElementById("empBankAccountNumber")?.value?.trim() || null;
  const accountHolderName = document.getElementById("empAccountHolderName")?.value?.trim() || null;
  const personalIdType = document.getElementById("empPersonalIdType")?.value?.trim() || null;
  const personalIdNumber = document.getElementById("empPersonalIdNumber")?.value?.trim() || null;
  const personalIdPhotoUrl = document.getElementById("empIdPhotoUrl")?.value?.trim() || null;
  const photoUrl = document.getElementById("empPhotoUrl")?.value?.trim() || null;

  // Validation
  if (email && !isValidEmail(email)) {
    showMessage("Please enter a valid email address.", true);
    return;
  }
  if (phone && !isValidPhone(phone)) {
    showMessage("Please enter a valid phone number.", true);
    return;
  }
  if (bankAccountNumber && !/^\d+$/.test(bankAccountNumber)) {
    showMessage("Bank account number must contain only digits.", true);
    return;
  }
  if (personalIdNumber && !isValidIdNumber(personalIdNumber)) {
    showMessage("Personal ID number must be at least 5 alphanumeric characters.", true);
    return;
  }
  if (personalIdPhotoUrl && !isValidUrl(personalIdPhotoUrl)) {
    showMessage("Please enter a valid personal ID photo URL (https://, http://, or data:image/*).", true);
    return;
  }
  if (photoUrl && !isValidUrl(photoUrl)) {
    showMessage("Please enter a valid photo URL (https://, http://, or data:image/*).", true);
    return;
  }

  const submitBtn = addEmployeeInfoForm?.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Adding…";
  }
  try {
    // Do NOT store sensitive PII: personalIdNumber, bankAccountNumber, etc. in Firestore in production without proper security rules and encryption.
    // acc details and ID numbers are stored here for demo purposes only.
    // self created Personal Information which doesnot not match with any real person's info. Do not use real data.
    const empData = {
      fullName,
      phone,
      email,
      department,
      address,
      bankName,
      bankAccountNumber,
      accountHolderName,
      personalIdType,
      personalIdNumber,
      personalIdPhotoUrl,
      photoUrl,
    };

    if (editingEmployeeId) {
      empData.updatedAt = new Date().toISOString();
      empData.updatedBy = auth.currentUser?.uid || null;
      await setDoc(doc(db, "employees", editingEmployeeId), empData, { merge: true });
      showMessage("Employee record updated.");
      editingEmployeeId = null;
      if (submitBtn) submitBtn.textContent = "Add employee (info only)";
    } else {
      empData.addedAt = new Date().toISOString();
      empData.addedBy = auth.currentUser?.uid || null;
      await addDoc(collection(db, "employees"), empData);
      showMessage("Employee record added.");
    }

    addEmployeeInfoForm?.reset();
    loadEmployeeRecords();
  } catch (err) {
    showMessage("Failed to add: " + (err.message || err), true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Add employee (info only)";
    }
  }
}
function createModal() {
  if (document.getElementById("confirmationModal")) return;
  const modalHtml = `
    <div id="confirmationModal" class="modal-overlay">
      <div class="modal-box">
        <h3 class="modal-title" id="modalTitle">Confirm Action</h3>
        <p class="modal-text" id="modalText">Are you sure?</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="btnModalCancel">Cancel</button>
          <button type="button" class="btn btn-danger" id="btnModalConfirm">Confirm</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
  
  document.getElementById("btnModalCancel").addEventListener("click", hideModal);
  document.getElementById("btnModalConfirm").addEventListener("click", () => {
    if (modalConfirmCallback) modalConfirmCallback();
    hideModal();
  });
  document.getElementById("confirmationModal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) hideModal();
  });
}

function showModal(title, text, onConfirm) {
  const modal = document.getElementById("confirmationModal");
  if (!modal) return;
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalText").textContent = text;
  modalConfirmCallback = onConfirm;
  modal.classList.add("open");
}

function hideModal() {
  const modal = document.getElementById("confirmationModal");
  if (modal) modal.classList.remove("open");
  modalConfirmCallback = null;
}

function deleteEmployee(id) {
  showModal(
    "Remove Employee",
    "Are you sure you want to remove this employee? This cannot be undone.",
    async () => {
      hideMessage();
      try {
        await deleteDoc(doc(db, "employees", id));
        showMessage("Employee record removed.");
        loadEmployeeRecords();
      } catch (err) {
        showMessage("Failed to remove: " + (err.message || err), true);
      }
    }
  );
}

function prepareEditEmployee(emp) {
  // Switch to Add Form tab (this will trigger the reset listener first)
  const formBtn = document.querySelector('.emp-section-btn[data-target="block-add-employee-form"]');
  if (formBtn) formBtn.click();

  editingEmployeeId = emp.id;
  
  // Populate fields
  if (document.getElementById("empFullName")) document.getElementById("empFullName").value = emp.fullName || "";
  if (document.getElementById("empPhone")) document.getElementById("empPhone").value = emp.phone || "";
  if (document.getElementById("empEmail")) document.getElementById("empEmail").value = emp.email || "";
  if (document.getElementById("empDepartment")) document.getElementById("empDepartment").value = emp.department || "";
  if (document.getElementById("empAddress")) document.getElementById("empAddress").value = emp.address || "";
  if (document.getElementById("empBankName")) document.getElementById("empBankName").value = emp.bankName || "";
  if (document.getElementById("empBankAccountNumber")) document.getElementById("empBankAccountNumber").value = emp.bankAccountNumber || "";
  if (document.getElementById("empAccountHolderName")) document.getElementById("empAccountHolderName").value = emp.accountHolderName || "";
  if (document.getElementById("empPersonalIdType")) document.getElementById("empPersonalIdType").value = emp.personalIdType || "";
  if (document.getElementById("empPersonalIdNumber")) document.getElementById("empPersonalIdNumber").value = emp.personalIdNumber || "";
  if (document.getElementById("empIdPhotoUrl")) document.getElementById("empIdPhotoUrl").value = emp.personalIdPhotoUrl || "";
  if (document.getElementById("empPhotoUrl")) document.getElementById("empPhotoUrl").value = emp.photoUrl || "";

  const submitBtn = addEmployeeInfoForm?.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Update Employee";
  showMessage("Editing " + (emp.fullName || "employee"));
}

// ─── Employee records table (Add Employee section) ───
async function loadEmployeeRecords() {
  if (!employeeRecordsListEl) return;
  employeeRecordsListEl.innerHTML = "<p class='loading-msg'>Loading employee records…</p>";
  try {
    const snap = await getDocs(collection(db, "employees"));
    allEmployeesData = [];
    snap.forEach((d) => allEmployeesData.push({ id: d.id, ...d.data() }));
    allEmployeesData.sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""));
    renderEmployeeTable(currentEmployeeDeptFilter);
  } catch (err) {
    employeeRecordsListEl.innerHTML = "<p class='error'>Failed to load: " + escapeHtml(err.message || err) + "</p>";
  }
}

function renderEmployeeTable(departmentFilter) {
  if (!employeeRecordsListEl) return;
  
  if (!document.getElementById("empSearchInput")) {
    employeeRecordsListEl.innerHTML = `
      <div style="margin-bottom: 1rem;">
        <input type="text" id="empSearchInput" placeholder="Search employees..." style="padding: 0.5rem; width: 100%; max-width: 300px; border: 1px solid #ccc; border-radius: 4px;">
      </div>
      <div id="employeeTableContainer"></div>
    `;
    document.getElementById("empSearchInput").addEventListener("input", () => {
      currentEmployeeIndex = 0;
      renderEmployeeRows();
    });
  }
  renderEmployeeRows();
}

function renderEmployeeRows() {
  const container = document.getElementById("employeeTableContainer");
  if (!container) return;

  let list = currentEmployeeDeptFilter
    ? allEmployeesData.filter((e) => (e.department || "") === departmentFilter)
    : allEmployeesData;

  const term = document.getElementById("empSearchInput")?.value?.toLowerCase() || "";
  if (term) {
    list = list.filter(e => 
      (e.fullName || "").toLowerCase().includes(term) ||
      (e.email || "").toLowerCase().includes(term) ||
      (e.phone || "").toLowerCase().includes(term)
    );
  }

  if (allEmployeesData.length === 0) {
    container.innerHTML = "<p class='empty-msg'>No employee records yet. Add one above.</p>";
    return;
  }
  if (list.length === 0) {
    container.innerHTML = "<p class='empty-msg'>No employees found.</p>";
    return;
  }

  // Populate dropdown with filtered list
  populateEmployeeDropdown(list);

  if (currentViewMode === "table") {
    renderTableView(list);
  } else {
    renderSingleView(list);
    // Update record count
    const recordCount = document.getElementById("empRecordCount");
    if (recordCount) {
      recordCount.textContent = `${currentEmployeeIndex + 1} of ${list.length}`;
    }
  }
}

function renderTableView(list) {
  const container = document.getElementById("employeeTableContainer");
  if (!container) return;
  const thead = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Department</th>
        <th>Phone</th>
        <th>Email</th>
        <th>Bank name</th>
        <th>Account holder</th>
        <th>Account Number</th>
        <th>ID Number</th>
        <th>ID Photo</th>
                <th>ID type</th>
        <th>Employee photo</th>
      </tr>
    </thead>`;
  let tbody = "<tbody>";
  for (const e of list) {
    tbody += `
      <tr>
        <td>${escapeHtml(e.fullName || "—")}</td>
        <td>${escapeHtml(e.department || "—")}</td>
        <td>${escapeHtml(e.phone || "—")}</td>
        <td>${escapeHtml(e.email || "—")}</td>
        <td>${escapeHtml(e.bankName || "—")}</td>
        <td>${escapeHtml(e.accountHolderName || "—")}</td>
        <td>${escapeHtml(e.bankAccountNumber || "—")}</td>
        <td>${escapeHtml(e.personalIdNumber || "—")}</td>
        <td>${e.personalIdPhotoUrl ? `<a href="${escapeHtml(e.personalIdPhotoUrl)}" target="_blank">View</a>` : "—"}</td>
        <td>${escapeHtml(e.personalIdType || "—")}</td>
        <td>${e.photoUrl ? `<a href="${escapeHtml(e.photoUrl)}" target="_blank">View</a>` : "—"}</td>


      </tr>`;
  }
  tbody += "</tbody>";
  container.innerHTML = "<table class=\"admin-table employee-records-table\">" + thead + tbody + "</table>";
}

function renderSingleView(list) {
  const container = document.getElementById("employeeTableContainer");
  if (!container) return;
  if (list.length === 0) return;
  
  // Clamp index within bounds
  if (currentEmployeeIndex >= list.length) {
    currentEmployeeIndex = list.length - 1;
  }
  if (currentEmployeeIndex < 0) {
    currentEmployeeIndex = 0;
  }

  const employee = list[currentEmployeeIndex];
  
  // Generate photo HTML
  let photoHtml = '';
  if (employee.photoUrl) {
    photoHtml = `
      <div class="employee-photo-wrap">
        <img src="${escapeHtml(employee.photoUrl)}" alt="${escapeHtml(employee.fullName || 'Employee')}" class="employee-photo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <div class="employee-photo-placeholder" style="display: none;">
          <span>${escapeHtml((employee.fullName || 'E').charAt(0).toUpperCase())}</span>
        </div>
      </div>
    `;
  } else {
    // Show placeholder with first letter of name
    photoHtml = `
      <div class="employee-photo-wrap">
        <div class="employee-photo-placeholder">
          <span>${escapeHtml((employee.fullName || 'E').charAt(0).toUpperCase())}</span>
        </div>
      </div>
    `;
  }
  
  // Generate ID Photo HTML
  let idPhotoHtml = '';
  if (employee.personalIdPhotoUrl) {
    idPhotoHtml = `
      <div style="width: 250px; height: 160px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; background: #f9fafb; display: flex; align-items: center; justify-content: center;">
        <a href="${escapeHtml(employee.personalIdPhotoUrl)}" target="_blank" title="View ID">
          <img src="${escapeHtml(employee.personalIdPhotoUrl)}" alt="ID" style="width: 100%; height: 100%; object-fit: cover;">
        </a>
      </div>
    `;
  } else {
    idPhotoHtml = `<div style="color: #9ca3af; font-size: 0.85rem; font-style: italic; padding: 0.5rem 0;">No ID photo</div>`;
  }

  const cardHtml = `
    <div class="employee-card">
      <div class="employee-card-header">
        <div class="employee-card-header-info">
          <h4>${escapeHtml(employee.fullName || "—")}</h4>
          <span class="employee-badge">${currentEmployeeIndex + 1} of ${list.length}</span>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button type="button" id="btnEditEmpSingle" class="btn btn-sm btn-outline">Edit</button>
          <button type="button" id="btnRemoveEmpSingle" class="btn btn-sm btn-danger">Remove</button>
        </div>
      </div>
      <div class="employee-card-body">
        <div class="employee-card-section" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
          <div style="flex: 1;">
            <h5>Contact Information</h5>
            <p><strong>Department:</strong> ${escapeHtml(employee.department || "—")}</p>
            <p><strong>Phone:</strong> ${escapeHtml(employee.phone || "—")}</p>
            <p><strong>Email:</strong> ${escapeHtml(employee.email || "—")}</p>
            <p><strong>Address:</strong> ${escapeHtml(employee.address || "—")}</p>
          </div>
          <div style="flex-shrink: 0;">
            ${photoHtml}
          </div>
        </div>
        <div class="employee-card-section">
          <h5>Bank Details</h5>
          <p><strong>Bank Name:</strong> ${escapeHtml(employee.bankName || "—")}</p>
          <p><strong>Account Number:</strong> ${escapeHtml(employee.bankAccountNumber || "—")}</p>
          <p><strong>Account Holder:</strong> ${escapeHtml(employee.accountHolderName || "—")}</p>
        </div>
        <div class="employee-card-section" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
          <div style="flex: 1;">
            <h5>ID Information</h5>
            <p><strong>ID Type:</strong> ${escapeHtml(employee.personalIdType || "—")}</p>
            <p><strong>ID Number:</strong> ${escapeHtml(employee.personalIdNumber || "—")}</p>
          </div>
          <div style="flex-shrink: 0;">
            ${idPhotoHtml}
          </div>
        </div>
      </div>
    </div>
  `;
  container.innerHTML = cardHtml;

  // Attach listeners for Edit/Remove
  document.getElementById("btnEditEmpSingle")?.addEventListener("click", () => prepareEditEmployee(employee));
  document.getElementById("btnRemoveEmpSingle")?.addEventListener("click", () => deleteEmployee(employee.id));

  // Update dropdown selection
  const dropdown = document.getElementById("empSelectDropdown");
  if (dropdown) {
    dropdown.value = currentEmployeeIndex;
  }

  // Update button states
  const prevBtn = document.getElementById("empPrevBtn");
  const nextBtn = document.getElementById("empNextBtn");
  if (prevBtn) prevBtn.disabled = currentEmployeeIndex === 0;
  if (nextBtn) nextBtn.disabled = currentEmployeeIndex === list.length - 1;
}

function populateEmployeeDropdown(list) {
  const dropdown = document.getElementById("empSelectDropdown");
  if (!dropdown) return;
  
  dropdown.innerHTML = '<option value="">Select employee...</option>';
  list.forEach((emp, idx) => {
    const option = document.createElement("option");
    option.value = idx;
    option.textContent = escapeHtml(emp.fullName || "Employee") + ` (#${idx + 1})`;
    dropdown.appendChild(option);
  });
}

function navigateEmployee(direction) {
  let list = currentEmployeeDeptFilter
    ? allEmployeesData.filter((e) => (e.department || "") === currentEmployeeDeptFilter)
    : allEmployeesData;

  const term = document.getElementById("empSearchInput")?.value?.toLowerCase() || "";
  if (term) {
    list = list.filter(e => 
      (e.fullName || "").toLowerCase().includes(term) ||
      (e.email || "").toLowerCase().includes(term) ||
      (e.phone || "").toLowerCase().includes(term)
    );
  }
  
  if (direction === "prev" && currentEmployeeIndex > 0) {
    currentEmployeeIndex--;
  } else if (direction === "next" && currentEmployeeIndex < list.length - 1) {
    currentEmployeeIndex++;
  }
  
  renderEmployeeRows();
}

function showPanel(sectionId) {
  document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".admin-nav-link").forEach((a) => a.classList.remove("active"));
  const panel = document.getElementById("panel-" + sectionId);
  const link = document.querySelector('.admin-nav-link[data-section="' + sectionId + '"]');
  if (panel) panel.classList.add("active");
  if (link) link.classList.add("active");
  if (sectionId === "add-employee") loadEmployeeRecords();
}
const COLLECTION_MACHINE_OPS = "rates_machineOperators";
const COLLECTION_PRODUCTIONS = "rates_productions";
const COLLECTION_DAILY = "rates_daily";

async function loadRates(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  const items = [];
  snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
  return items;
}

function renderMachineOps(listEl, items) {
  if (!listEl) return;
  if (items.length === 0) {
    listEl.innerHTML = "<p class='empty-msg'>No fibre rates yet. Add one above.</p>";
    return;
  }
  let html = `<table class="admin-table"><thead><tr><th>Fibre</th><th>Rate (Rs./m)</th><th>Actions</th></tr></thead><tbody>`;
  for (const x of items) {
    const name = escapeHtml(x.name || x.fibreName || "—");
    const rate = Number(x.ratePerMeter ?? x.rate ?? 0);
    html += `<tr data-id="${x.id}">
      <td>${name}</td>
      <td><input type="number" class="inline-edit" data-id="${x.id}" value="${rate}" min="0" step="0.01" data-collection="${COLLECTION_MACHINE_OPS}"></td>
      <td><button type="button" class="btn btn-sm btn-danger btn-rate-remove" data-id="${x.id}" data-collection="${COLLECTION_MACHINE_OPS}">Remove</button></td>
    </tr>`;
  }
  html += "</tbody></table>";
  listEl.innerHTML = html;
  attachRateListeners(listEl);
}

function renderProductions(listEl, items) {
  if (!listEl) return;
  if (items.length === 0) {
    listEl.innerHTML = "<p class='empty-msg'>No product rates yet. Add one above.</p>";
    return;
  }
  let html = `<table class="admin-table"><thead><tr><th>Product</th><th>Rate (Rs./piece)</th><th>Actions</th></tr></thead><tbody>`;
  for (const x of items) {
    const name = escapeHtml(x.name || x.productName || "—");
    const rate = Number(x.ratePerPiece ?? x.rate ?? 0);
    html += `<tr data-id="${x.id}">
      <td>${name}</td>
      <td><input type="number" class="inline-edit" data-id="${x.id}" value="${rate}" min="0" step="0.01" data-collection="${COLLECTION_PRODUCTIONS}"></td>
      <td><button type="button" class="btn btn-sm btn-danger btn-rate-remove" data-id="${x.id}" data-collection="${COLLECTION_PRODUCTIONS}">Remove</button></td>
    </tr>`;
  }
  html += "</tbody></table>";
  listEl.innerHTML = html;
  attachRateListeners(listEl);
}

function renderDaily(listEl, items) {
  if (!listEl) return;
  if (items.length === 0) {
    listEl.innerHTML = "<p class='empty-msg'>No hourly rates yet. Add one above.</p>";
    return;
  }
  let html = `<table class="admin-table"><thead><tr><th>Label</th><th>Hourly rate (Rs./hr)</th><th>Actions</th></tr></thead><tbody>`;
  for (const x of items) {
    const label = escapeHtml(x.label || x.name || "—");
    const rate = Number(x.hourlyRate ?? x.rate ?? 0);
    html += `<tr data-id="${x.id}">
      <td>${label}</td>
      <td><input type="number" class="inline-edit" data-id="${x.id}" value="${rate}" min="0" step="0.01" data-collection="${COLLECTION_DAILY}"></td>
      <td><button type="button" class="btn btn-sm btn-danger btn-rate-remove" data-id="${x.id}" data-collection="${COLLECTION_DAILY}">Remove</button></td>
    </tr>`;
  }
  html += "</tbody></table>";
  listEl.innerHTML = html;
  attachRateListeners(listEl);
}

function attachRateListeners(container) {
  if (!container) return;
  container.querySelectorAll(".inline-edit").forEach((input) => {
    const save = () => updateRate(input.dataset.collection, input.dataset.id, null, parseFloat(input.value));
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  });
  container.querySelectorAll(".btn-rate-remove").forEach((btn) => {
    btn.addEventListener("click", () => removeRate(btn.dataset.collection, btn.dataset.id));
  });
}

async function updateRate(collectionName, id, nameField, numberValue) {
  hideMessage();
  try {
    const ref = doc(db, collectionName, id);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : {};
    if (collectionName === COLLECTION_MACHINE_OPS) {
      await setDoc(ref, { ...existing, ratePerMeter: numberValue }, { merge: true });
    } else if (collectionName === COLLECTION_PRODUCTIONS) {
      await setDoc(ref, { ...existing, ratePerPiece: numberValue }, { merge: true });
    } else if (collectionName === COLLECTION_DAILY) {
      await setDoc(ref, { ...existing, hourlyRate: numberValue }, { merge: true });
    }
    showMessage("Rate updated.");
    loadAllRates();
  } catch (err) {
    showMessage("Failed to update: " + (err.message || err), true);
  }
}

async function removeRate(collectionName, id) {
  if (!confirm("Remove this rate?")) return;
  hideMessage();
  try {
    await deleteDoc(doc(db, collectionName, id));
    showMessage("Rate removed.");
    loadAllRates();
  } catch (err) {
    showMessage("Failed to remove: " + (err.message || err), true);
  }
}

async function loadAllRates() {
  const listMachineOps = document.getElementById("listMachineOps");
  const listProductions = document.getElementById("listProductions");
  const listDaily = document.getElementById("listDaily");
  try {
    listMachineOps && (listMachineOps.innerHTML = "<p class='loading-msg'>Loading…</p>");
    listProductions && (listProductions.innerHTML = "<p class='loading-msg'>Loading…</p>");
    listDaily && (listDaily.innerHTML = "<p class='loading-msg'>Loading…</p>");
    const [ops, prods, daily] = await Promise.all([
      loadRates(COLLECTION_MACHINE_OPS),
      loadRates(COLLECTION_PRODUCTIONS),
      loadRates(COLLECTION_DAILY)
    ]);
    renderMachineOps(listMachineOps, ops);
    renderProductions(listProductions, prods);
    renderDaily(listDaily, daily);
  } catch (err) {
    showMessage("Failed to load rates: " + (err.message || err), true);
    listMachineOps && (listMachineOps.innerHTML = "<p class='error'>Failed to load.</p>");
    listProductions && (listProductions.innerHTML = "<p class='error'>Failed to load.</p>");
    listDaily && (listDaily.innerHTML = "<p class='error'>Failed to load.</p>");
  }
}

async function addMachineOp(name, ratePerMeter) {
  hideMessage();
  if (!name || ratePerMeter == null || ratePerMeter < 0) {
    showMessage("Enter fibre name and rate.", true);
    return;
  }
  try {
    await addDoc(collection(db, COLLECTION_MACHINE_OPS), {
      name: name.trim(),
      ratePerMeter: Number(ratePerMeter),
      unit: "/m"
    });
    showMessage("Fibre rate added.");
    document.getElementById("fibreName").value = "";
    document.getElementById("fibreRate").value = "";
    loadAllRates();
  } catch (err) {
    showMessage("Failed to add: " + (err.message || err), true);
  }
}

async function addProduction(name, ratePerPiece) {
  hideMessage();
  if (!name || ratePerPiece == null || ratePerPiece < 0) {
    showMessage("Enter product name and rate.", true);
    return;
  }
  try {
    await addDoc(collection(db, COLLECTION_PRODUCTIONS), {
      name: name.trim(),
      ratePerPiece: Number(ratePerPiece),
      unit: "/p"
    });
    showMessage("Product rate added.");
    document.getElementById("productName").value = "";
    document.getElementById("productRate").value = "";
    loadAllRates();
  } catch (err) {
    showMessage("Failed to add: " + (err.message || err), true);
  }
}

async function addDaily(label, hourlyRate) {
  hideMessage();
  if (!label || hourlyRate == null || hourlyRate < 0) {
    showMessage("Enter label and hourly rate.", true);
    return;
  }
  try {
    await addDoc(collection(db, COLLECTION_DAILY), {
      label: label.trim(),
      hourlyRate: Number(hourlyRate)
    });
    showMessage("Hourly rate added.");
    document.getElementById("dailyLabel").value = "";
    document.getElementById("dailyRate").value = "";
    loadAllRates();
  } catch (err) {
    showMessage("Failed to add: " + (err.message || err), true);
  }
}

function init() {
  createModal();
  loadUsers();
  loadAllRates();

  document.querySelectorAll(".admin-nav-link").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const section = a.getAttribute("data-section");
      if (section) showPanel(section);
    });
    // Keyboard support for role="button"
    a.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const section = a.getAttribute("data-section");
        if (section) showPanel(section);
      }
    });
  });

  // Toggle between Add Employee Form and Records List
  document.querySelectorAll(".emp-section-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".emp-section-btn").forEach((b) => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-outline");
      });
      btn.classList.remove("btn-outline");
      btn.classList.add("btn-primary");
      
      const target = btn.dataset.target;
      document.getElementById("block-add-employee-form").style.display = target === "block-add-employee-form" ? "block" : "none";
      document.getElementById("block-employee-records").style.display = target === "block-employee-records" ? "block" : "none";
      
      // Reset edit state when switching to Add Form manually
      if (target === "block-add-employee-form") {
        editingEmployeeId = null;
        addEmployeeInfoForm?.reset();
        const submitBtn = addEmployeeInfoForm?.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = "Add employee (info only)";
      }
    });
  });

  document.querySelectorAll(".emp-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".emp-filter-btn").forEach((b) => {
        b.classList.remove("btn-primary", "active");
        b.classList.add("btn-outline");
      });
      btn.classList.remove("btn-outline");
      btn.classList.add("btn-primary", "active");
      currentEmployeeDeptFilter = btn.getAttribute("data-department") || "";
      currentEmployeeIndex = 0; // Reset index when changing department
      renderEmployeeTable(currentEmployeeDeptFilter);
    });
  });

  // View mode toggle (Table vs Single)
  document.querySelectorAll(".emp-view-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".emp-view-mode-btn").forEach((b) => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-outline");
      });
      btn.classList.remove("btn-outline");
      btn.classList.add("btn-primary", "active");
      
      const mode = btn.getAttribute("data-view");
      currentViewMode = mode;
      currentEmployeeIndex = 0; // Reset index when switching mode
      
      const singleViewControls = document.getElementById("singleViewControls");
      if (singleViewControls) {
        if (mode === "single") {
          singleViewControls.style.display = "flex";
        } else {
          singleViewControls.style.display = "none";
        }
      }
      
      renderEmployeeTable(currentEmployeeDeptFilter);
    });
  });

  // Previous/Next buttons for single view
  const prevBtn = document.getElementById("empPrevBtn");
  const nextBtn = document.getElementById("empNextBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => navigateEmployee("prev"));
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => navigateEmployee("next"));
  }

  // Dropdown selector for single view
  const dropdown = document.getElementById("empSelectDropdown");
  if (dropdown) {
    dropdown.addEventListener("change", (e) => {
      const value = e.target.value;
      if (value !== "") {
        currentEmployeeIndex = parseInt(value, 10);
        renderEmployeeTable(currentEmployeeDeptFilter);
      }
    });
  }

  document.querySelectorAll(".rate-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".rate-filter-btn").forEach((b) => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-outline");
      });
      btn.classList.remove("btn-outline");
      btn.classList.add("btn-primary");
      document.querySelectorAll(".rate-block").forEach((blk) => {
        blk.style.display = blk.id === btn.dataset.target ? "block" : "none";
      });
    });
  });

  if (addUserForm) {
    addUserForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("newEmail")?.value?.trim();
      const password = document.getElementById("newPassword")?.value;
      const role = document.getElementById("newRole")?.value;
      addUser(email, password, role);
    });
  }

  if (addEmployeeInfoForm) {
    addEmployeeInfoForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addEmployeeInfo();
    });
  }

  document.getElementById("formMachineOps")?.addEventListener("submit", (e) => {
    e.preventDefault();
    addMachineOp(document.getElementById("fibreName")?.value?.trim(), document.getElementById("fibreRate")?.value);
  });
  document.getElementById("formProductions")?.addEventListener("submit", (e) => {
    e.preventDefault();
    addProduction(document.getElementById("productName")?.value?.trim(), document.getElementById("productRate")?.value);
  });
  document.getElementById("formDaily")?.addEventListener("submit", (e) => {
    e.preventDefault();
    addDaily(document.getElementById("dailyLabel")?.value?.trim(), document.getElementById("dailyRate")?.value);
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
        window.location.replace("login.html");
      } catch (err) {
        showMessage("Logout failed: " + (err.message || err), true);
      }
    });
  }
}

init();
