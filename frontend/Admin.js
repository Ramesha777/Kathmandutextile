// admin.js – Admin dashboard: add/remove employees, change roles (Firebase Auth + Firestore)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
  signInWithEmailAndPassword
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
const newUserRefInput = document.getElementById("newUserRef");
const employeeUserRefList = document.getElementById("employeeUserRefList");
const newEmailInput = document.getElementById("newEmail");

let allEmployeesData = [];
let allUsersData = [];
let currentEmployeeDeptFilter = "";
let editingEmployeeId = null;
let modalConfirmCallback = null;
let employeeUserAccessLookup = [];

// Employee modal elements
let employeeModal = null;
let employeeModalBody = null;
let modalCloseEmployee = null;

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
          <th>Name</th>
          <th>Role</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (const u of users) {
    const displayName = (u.displayName || u.name || "").trim() || (u.email || u.uid || "—");
    const email = u.email || u.uid || "";
    const role = (u.role || "employee").trim();
    const isSelf = u.uid === currentUid;
    html += `
      <tr data-uid="${u.uid}">
        <td title="${escapeHtml(email || "—")}">${escapeHtml(displayName)}</td>
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
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

async function loadEmployeeUserRefs() {
  try {
    const snap = await getDocs(collection(db, "employees"));
    employeeUserAccessLookup = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        fullName: (data.fullName || "").trim(),
        email: (data.email || "").trim()
      };
    });

    if (employeeUserRefList) {
      const options = employeeUserAccessLookup.map((e) => {
        const label = e.fullName ? `${e.fullName} (${e.id})` : e.id;
        return `<option value="${escapeHtml(label)}"></option>`;
      });
      employeeUserRefList.innerHTML = options.join("");
    }
  } catch (err) {
    console.error("Failed to load employee references:", err);
  }
}

function resolveEmployeeFromRef(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  const idMatch = value.match(/\(([^()]+)\)\s*$/);
  const extractedId = idMatch ? idMatch[1].trim() : null;

  let found = null;
  if (extractedId) {
    found = employeeUserAccessLookup.find((e) => e.id === extractedId) || null;
    if (found) return found;
  }

  found = employeeUserAccessLookup.find((e) => e.id === value) || null;
  if (found) return found;

  found = employeeUserAccessLookup.find((e) => e.fullName.toLowerCase() === value.toLowerCase()) || null;
  return found || null;
}

// No auto-fill: employee dropdown is for view/select only; admin enters email manually.
function autofillUserEmailFromEmployeeRef() {
  // Intentionally empty: email is entered manually when granting access.
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

async function addUser(email, password, role, displayName) {
  hideMessage();
  if (!email || !password || !role) {
    showMessage("Please fill email, password, and role.", true);
    return;
  }
  if (!ROLES.includes(role)) {
    showMessage("Invalid role.", true);
    return;
  }
  const adminEmail = auth.currentUser?.email;
  const adminPassword = document.getElementById("adminPasswordToStay")?.value?.trim() || "";
  const submitBtn = addUserForm?.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating…";
  }
  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", userCred.user.uid), {
      email: email.trim(),
      role: role,
      displayName: displayName || null
    });
    await signOut(auth);
    if (adminEmail && adminPassword) {
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      showMessage("User created. You are still logged in.");
      loadUsers();
      addUserForm?.reset();
    } else {
      window.location.replace("login.html?msg=User+created.+Please+sign+in+again.");
      return;
    }
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
      // Auto-generate employee ID from last 5 digits of phone number
      let employeeId = null;
      if (phone) {
        // Extract only digits from phone and get last 5
        const phoneDigits = phone.replace(/\D/g, '');
        employeeId = phoneDigits.slice(-5); // last 5 digits
        
        // Check if this ID already exists
        const existingSnap = await getDoc(doc(db, "employees", employeeId));
        if (existingSnap.exists()) {
          showMessage(`Employee ID ${employeeId} (from phone) already exists. Please use a different phone number.`, true);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Add employee (info only)";
          }
          return;
        }
      } else {
        showMessage("Phone number is required to generate employee ID.", true);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Add employee (info only)";
        }
        return;
      }

      empData.addedAt = new Date().toISOString();
      empData.addedBy = auth.currentUser?.uid || null;
      await setDoc(doc(db, "employees", employeeId), empData);
      showMessage(`Employee record added with ID: ${employeeId}`);
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

function createEmployeeModal() {
  // Use modal already present in admin.html
  employeeModal = document.getElementById("employee-modal");
  employeeModalBody = document.getElementById("employee-modal-body");
  modalCloseEmployee = document.getElementById("modal-close-employee");

  // Fallback only if missing
  if (!employeeModal || !employeeModalBody || !modalCloseEmployee) {
    const modalHtml = `
    <div id="employee-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; justify-content:center; align-items:center;">
      <div class="modal-box employee-modal-content">
        <div class="modal-header">
          <h3>Employee Details</h3>
          <button type="button" class="modal-close" id="modal-close-employee">&times;</button>
        </div>
        <div class="modal-body" id="employee-modal-body"></div>
      </div>
    </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);
    employeeModal = document.getElementById("employee-modal");
    employeeModalBody = document.getElementById("employee-modal-body");
    modalCloseEmployee = document.getElementById("modal-close-employee");
  }

  if (modalCloseEmployee) {
    modalCloseEmployee.onclick = closeEmployeeModal;
  }

  if (employeeModal) {
    employeeModal.onclick = (e) => {
      if (e.target === employeeModal) closeEmployeeModal();
    };
  }
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

// Employee Modal Functions
function showEmployeeModal(emp) {
  try {
    if (!emp) {
      showMessage("Employee details not found.", true);
      return;
    }

    createEmployeeModal();
    if (!employeeModal || !employeeModalBody) {
      showMessage("Could not open employee modal.", true);
      return;
    }
    
    // Generate photo HTML
    let photoHtml = '';
    if (emp.photoUrl) {
      photoHtml = `
        <div class="employee-modal-photo-wrap">
          <img src="${escapeHtml(emp.photoUrl)}" referrerpolicy="no-referrer" alt="${escapeHtml(emp.fullName || 'Employee')}" class="employee-modal-photo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
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
            <img src="${escapeHtml(emp.personalIdPhotoUrl)}" referrerpolicy="no-referrer" alt="ID Photo" onerror="this.parentElement.style.display='none';">
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
            <span class="employee-modal-badge">ID: ${escapeHtml(emp.id || '—')}</span>
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
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-primary" id="btn-modal-edit">Edit</button>
          <button type="button" class="btn btn-danger" id="btn-modal-remove">Remove</button>
        </div>
      </div>
    `;
    
    employeeModalBody.innerHTML = modalContent;
    employeeModal.style.display = "flex";
    
    // Add event listeners for Edit and Remove buttons in modal
    document.getElementById('btn-modal-edit')?.addEventListener('click', () => {
      closeEmployeeModal();
      prepareEditEmployee(emp);
    });
    
    document.getElementById('btn-modal-remove')?.addEventListener('click', () => {
      closeEmployeeModal();
      deleteEmployee(emp.id);
    });
  } catch (err) {
    console.error("Failed to show employee modal:", err);
    showMessage("Failed to open employee details.", true);
  }
}

function closeEmployeeModal() {
  if (employeeModal) {
    employeeModal.style.display = "none";
  }
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
      renderEmployeeRows();
    });
  }
  renderEmployeeRows();
}

function renderEmployeeRows() {
  const container = document.getElementById("employeeTableContainer");
  if (!container) return;

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

  if (allEmployeesData.length === 0) {
    container.innerHTML = "<p class='empty-msg'>No employee records yet. Add one above.</p>";
    return;
  }
  if (list.length === 0) {
    container.innerHTML = "<p class='empty-msg'>No employees found.</p>";
    return;
  }

  renderTableView(list);
}

function renderTableView(list) {
  const container = document.getElementById("employeeTableContainer");
  if (!container) return;
  const thead = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Employee ID</th>
        <th>Department</th>
        <th>Phone</th>
        <th>Email</th>
        <th>Actions</th>
      </tr>
    </thead>`;
  let tbody = "<tbody>";
  for (const e of list) {
    tbody += `
      <tr>
        <td>${escapeHtml(e.fullName || "—")}</td>
        <td>${escapeHtml(e.id || "—")}</td>
        <td>${escapeHtml(e.department || "—")}</td>
        <td>${escapeHtml(e.phone || "—")}</td>
        <td>${escapeHtml(e.email || "—")}</td>
        <td><button type="button" class="btn btn-sm btn-primary btn-view-employee" data-id="${e.id}">View</button></td>
      </tr>`;
  }
  tbody += "</tbody>";
  container.innerHTML = "<table class=\"admin-table employee-records-table\">" + thead + tbody + "</table>";
  
  // Add click listeners to view buttons
  container.querySelectorAll('.btn-view-employee').forEach(btn => {
    btn.addEventListener('click', () => {
      const empId = btn.getAttribute('data-id');
      const emp = allEmployeesData.find(e => e.id === empId);
      if (emp) {
        showEmployeeModal(emp);
      }
    });
  });
}


function showPanel(sectionId) {
  document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".admin-nav-link").forEach((a) => a.classList.remove("active"));
  const panel = document.getElementById("panel-" + sectionId);
  const link = document.querySelector('.admin-nav-link[data-section="' + sectionId + '"]');
  if (panel) panel.classList.add("active");
  if (link) link.classList.add("active");
  if (sectionId === "add-employee") loadEmployeeRecords();
  if (sectionId === "production-log") loadProductionLog();
}
const COLLECTION_MACHINE_OPS = "rates_machineOperators";
const COLLECTION_PRODUCTIONS = "rates_productions";
const COLLECTION_DAILY = "rates_daily";

function normalizeText(v) {
  return String(v == null ? "" : v).trim();
}

function isFibreCategory(category) {
  const c = normalizeText(category).toLowerCase();
  return c === "fiber" || c === "fibre";
}

function isFinishedProductCategory(category) {
  const c = normalizeText(category).toLowerCase();
  return c === "finished product";
}

async function loadFibreOptionsFromInventory() {
  const fibreSelect = document.getElementById("fibreName");
  if (!fibreSelect) return;

  const currentValue = fibreSelect.value;
  try {
    const snap = await getDocs(collection(db, "inventory"));
    const namesSet = new Set();
    snap.forEach((d) => {
      const item = d.data() || {};
      if (!isFibreCategory(item.category)) return;
      const n = normalizeText(item.name);
      if (n) namesSet.add(n);
    });

    const names = Array.from(namesSet).sort((a, b) => a.localeCompare(b));
    const options = [
      `<option value="">Select fibre</option>`,
      ...names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`),
      `<option value="__other__">Other (type manually)</option>`
    ];
    fibreSelect.innerHTML = options.join("");

    const shouldKeep = names.includes(currentValue) || currentValue === "__other__" || currentValue === "";
    fibreSelect.value = shouldKeep ? currentValue : "";
  } catch (err) {
    console.error("Failed to load fibre inventory options:", err);
    fibreSelect.innerHTML = `
      <option value="">Select fibre</option>
      <option value="__other__">Other (type manually)</option>
    `;
  }

  toggleOtherFibreInput();
}

function toggleOtherFibreInput() {
  const fibreSelect = document.getElementById("fibreName");
  const otherWrap = document.getElementById("fibreNameOtherWrap");
  const otherInput = document.getElementById("fibreNameOther");
  if (!fibreSelect || !otherWrap || !otherInput) return;

  const isOther = fibreSelect.value === "__other__";
  otherWrap.style.display = isOther ? "block" : "none";
  otherInput.required = isOther;
  if (!isOther) otherInput.value = "";
}

function getSelectedFibreName() {
  const fibreSelect = document.getElementById("fibreName");
  const otherInput = document.getElementById("fibreNameOther");
  if (!fibreSelect) return "";

  if (fibreSelect.value === "__other__") {
    return normalizeText(otherInput?.value);
  }
  return normalizeText(fibreSelect.value);
}

async function loadProductOptionsFromInventory() {
  const productSelect = document.getElementById("productName");
  if (!productSelect) return;

  const currentValue = productSelect.value;
  try {
    const snap = await getDocs(collection(db, "inventory"));
    const namesSet = new Set();
    snap.forEach((d) => {
      const item = d.data() || {};
      if (!isFinishedProductCategory(item.category)) return;
      const n = normalizeText(item.name);
      if (n) namesSet.add(n);
    });

    const names = Array.from(namesSet).sort((a, b) => a.localeCompare(b));
    const options = [
      `<option value="">Select product</option>`,
      ...names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`),
      `<option value="__other__">Other (type manually)</option>`
    ];
    productSelect.innerHTML = options.join("");

    const shouldKeep = names.includes(currentValue) || currentValue === "__other__" || currentValue === "";
    productSelect.value = shouldKeep ? currentValue : "";
  } catch (err) {
    console.error("Failed to load finished-product options:", err);
    productSelect.innerHTML = `
      <option value="">Select product</option>
      <option value="__other__">Other (type manually)</option>
    `;
  }

  toggleOtherProductInput();
}

function toggleOtherProductInput() {
  const productSelect = document.getElementById("productName");
  const otherWrap = document.getElementById("productNameOtherWrap");
  const otherInput = document.getElementById("productNameOther");
  if (!productSelect || !otherWrap || !otherInput) return;

  const isOther = productSelect.value === "__other__";
  otherWrap.style.display = isOther ? "block" : "none";
  otherInput.required = isOther;
  if (!isOther) otherInput.value = "";
}

function getSelectedProductName() {
  const productSelect = document.getElementById("productName");
  const otherInput = document.getElementById("productNameOther");
  if (!productSelect) return "";

  if (productSelect.value === "__other__") {
    return normalizeText(otherInput?.value);
  }
  return normalizeText(productSelect.value);
}

// ─── Production Log (finished product items from inventory) ───
async function loadProductionLog() {
  const listEl = document.getElementById("productionLogList");
  if (!listEl) return;
  listEl.innerHTML = "<p class='loading-msg'>Loading production log…</p>";
  try {
    const snap = await getDocs(collection(db, "inventory"));
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((x) => isFinishedProductCategory(x.category));
    items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (items.length === 0) {
      listEl.innerHTML = "<p class='empty-msg'>No finished product items in inventory. Add inventory with category \"Finished product\".</p>";
      return;
    }
    renderProductionLogTable(listEl, items);
  } catch (err) {
    listEl.innerHTML = "<p class='error'>Failed to load production log: " + escapeHtml(err.message || err) + "</p>";
  }
}

function renderProductionLogTable(container, items) {
  if (!container) return;
  let html = `
    <table class="admin-table production-log-table">
      <thead>
        <tr>
          <th>Barcode / ID</th>
          <th>Product name</th>
          <th>Quantity</th>
          <th>Unit</th>
          <th>Storage area</th>
          <th>Purchase date</th>
          <th>Expiry date</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (const x of items) {
    const qty = x.quantity != null ? x.quantity : "—";
    const unit = x.unit || x.units || "—";
    const purchaseDate = x.purchaseDate || "—";
    const expiryDate = x.expiryDate || "—";
    html += `
      <tr>
        <td>${escapeHtml(x.barcode || x.id || "—")}</td>
        <td>${escapeHtml(x.name || "—")}</td>
        <td>${escapeHtml(qty)}</td>
        <td>${escapeHtml(unit)}</td>
        <td>${escapeHtml(x.storageArea || "—")}</td>
        <td>${escapeHtml(purchaseDate)}</td>
        <td>${escapeHtml(expiryDate)}</td>
      </tr>
    `;
  }
  html += "</tbody></table>";
  container.innerHTML = html;
}

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
    const otherInput = document.getElementById("fibreNameOther");
    if (otherInput) otherInput.value = "";
    toggleOtherFibreInput();
    loadAllRates();
    loadFibreOptionsFromInventory();
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
    const otherInput = document.getElementById("productNameOther");
    if (otherInput) otherInput.value = "";
    toggleOtherProductInput();
    loadAllRates();
    loadProductOptionsFromInventory();
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
  loadFibreOptionsFromInventory();
  loadProductOptionsFromInventory();
  loadEmployeeUserRefs();

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
      renderEmployeeTable(currentEmployeeDeptFilter);
    });
  });


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

  if (newUserRefInput) {
    newUserRefInput.addEventListener("input", autofillUserEmailFromEmployeeRef);
    newUserRefInput.addEventListener("change", autofillUserEmailFromEmployeeRef);
  }

  if (addUserForm) {
    addUserForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("newEmail")?.value?.trim();
      const password = document.getElementById("newPassword")?.value;
      const role = document.getElementById("newRole")?.value;
      const found = resolveEmployeeFromRef(document.getElementById("newUserRef")?.value);
      const displayName = found?.fullName || null;
      addUser(email, password, role, displayName);
    });
  }

  if (addEmployeeInfoForm) {
    addEmployeeInfoForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addEmployeeInfo();
    });
  }

  document.getElementById("fibreName")?.addEventListener("change", () => {
    toggleOtherFibreInput();
  });

  document.getElementById("formMachineOps")?.addEventListener("submit", (e) => {
    e.preventDefault();
    addMachineOp(getSelectedFibreName(), document.getElementById("fibreRate")?.value);
  });
  document.getElementById("productName")?.addEventListener("change", () => {
    toggleOtherProductInput();
  });

  document.getElementById("formProductions")?.addEventListener("submit", (e) => {
    e.preventDefault();
    addProduction(getSelectedProductName(), document.getElementById("productRate")?.value);
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
