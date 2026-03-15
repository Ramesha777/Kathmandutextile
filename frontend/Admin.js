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
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";
import { initAdminBookHoliday } from "./manageholiday.js";
import { loadPunchRecords, renderPunchRecords, resetPunchRecords, setPunchDeleteSuccessCallback } from "./punchrecords.js";

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

function autofillUserEmailFromEmployeeRef() {
  if (!newUserRefInput || !newEmailInput) return;
  const found = resolveEmployeeFromRef(newUserRefInput.value);
  newEmailInput.value = found?.email || "";
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

// Admin API configuration — URL should be set at build/deploy time via environment config.
// Do NOT embed secrets in frontend code. The backend should authenticate
// requests using session cookies or Firebase ID tokens, not a static API key.
function getAdminApiBaseUrl() {
  // Use a runtime-configured URL; fall back to relative path so requests
  // go through the same origin (which should be HTTPS in production).
  return window.__ADMIN_API_BASE_URL || "/api";
}

async function deleteAuthUserViaBackend(uid) {
  // Obtain the current user's Firebase ID token to authenticate the request
  // server-side instead of sending a static secret.
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be signed in to perform this action.");
  }
  const idToken = await currentUser.getIdToken();

  const response = await fetch(`${getAdminApiBaseUrl()}/admin/delete-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`
    },
    credentials: "same-origin",
    body: JSON.stringify({ uid })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Failed to delete Firebase Auth user.");
  }
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
  const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ""));
}

function isValidIdNumber(idNumber) {
  if (!idNumber || typeof idNumber !== "string") return false;
  return idNumber.length >= 5 && /^[a-zA-Z0-9]+$/.test(idNumber);
}

function isValidUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const urlObj = new URL(url);
    const allowedProtocols = ["https:", "http:", "data:"];
    const isAllowedProtocol = allowedProtocols.some(proto => urlObj.href.startsWith(proto));
    if (!isAllowedProtocol) return false;
    if (urlObj.href.startsWith("data:")) {
      return urlObj.href.startsWith("data:image/");
    }
    return true;
  } catch (e) {
    return false;
  }
}

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
      let employeeId = null;
      if (phone) {
        const phoneDigits = phone.replace(/\D/g, '');
        employeeId = phoneDigits.slice(-5);
        
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
  employeeModal = document.getElementById("employee-modal");
  employeeModalBody = document.getElementById("employee-modal-body");
  modalCloseEmployee = document.getElementById("modal-close-employee");

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
  const formBtn = document.querySelector('.emp-section-btn[data-target="block-add-employee-form"]');
  if (formBtn) formBtn.click();

  editingEmployeeId = emp.id;
  
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

let adminHolidaysData = [];

async function loadAdminHolidays() {
  const listEl = document.getElementById("admin-holidays-list");
  const filterEl = document.getElementById("admin-holiday-filter-employee");
  if (!listEl) return;
  listEl.innerHTML = "<p style='padding:2rem;text-align:center;color:#64748b;'>Loading holiday data…</p>";
  try {
    const [holidaysSnap, employeesSnap] = await Promise.all([
      getDocs(collection(db, "holidays")),
      getDocs(collection(db, "employees"))
    ]);
    adminHolidaysData = holidaysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const employees = employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    adminHolidaysData.sort((a, b) => (b.dateFrom || "").localeCompare(a.dateFrom || ""));

    if (filterEl) {
      const empIds = [...new Set(adminHolidaysData.map((h) => h.employeeId).filter(Boolean))];
      const currentVal = filterEl.value;
      filterEl.innerHTML = "<option value=''>All employees</option>" + empIds.map((eid) => {
        const emp = employees.find((e) => e.id === eid);
        const name = emp ? (emp.fullName || emp.name || emp.id) : eid;
        return `<option value="${escapeHtml(eid)}">${escapeHtml(name)}</option>`;
      }).join("");
      if (currentVal && empIds.includes(currentVal)) filterEl.value = currentVal;
    }

    renderAdminHolidays();
    await initAdminBookHoliday(loadAdminHolidays);
  } catch (err) {
    console.error("loadAdminHolidays failed:", err);
    listEl.innerHTML = "<p style='padding:2rem;text-align:center;color:#ef4444;'>Failed to load: " + escapeHtml(err.message || err) + "</p>";
  }
}

function adminHolidayStatusBadge(s) {
  const st = (s || "pending").toLowerCase();
  const colors = { approved: "#10b981", rejected: "#ef4444", pending: "#f59e0b" };
  const c = colors[st] || "#64748b";
  return `<span style="padding:0.2rem 0.5rem;border-radius:6px;font-size:0.8rem;background:${c}33;color:${c};font-weight:600;">${escapeHtml(st)}</span>`;
}

function renderAdminHolidays() {
  const listEl = document.getElementById("admin-holidays-list");
  const filterEl = document.getElementById("admin-holiday-filter-employee");
  const statusFilterEl = document.getElementById("admin-holiday-filter-status");
  if (!listEl) return;
  const empFilter = filterEl?.value?.trim() || "";
  const statusFilter = statusFilterEl?.value?.trim() || "";
  let items = adminHolidaysData;
  if (empFilter) items = items.filter((h) => h.employeeId === empFilter);
  if (statusFilter) items = items.filter((h) => (h.status || "pending").toLowerCase() === statusFilter.toLowerCase());

  if (items.length === 0) {
    listEl.innerHTML = "<p style='padding:2rem;text-align:center;color:#64748b;'>No holiday records found.</p>";
    return;
  }

  listEl.innerHTML = `
    <table class="admin-table" style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Employee</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">From</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">To</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Type</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Status</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Notes</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((h) => `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.06);" data-id="${escapeHtml(h.id)}">
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(h.employeeName || h.employeeId || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(h.dateFrom || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(h.dateTo || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(h.type || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">${adminHolidayStatusBadge(h.status)}</td>
            <td style="padding:0.6rem 0.8rem;color:#94a3b8;">${escapeHtml(h.notes || "—")}</td>
            <td style="padding:0.6rem 0.8rem;white-space:nowrap;">
              <button type="button" class="btn-holiday-approve btn btn-sm" data-id="${h.id}" style="width:auto;padding:0.25rem 0.5rem;font-size:0.75rem;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:4px;">Approve</button>
              <button type="button" class="btn-holiday-reject btn btn-sm" data-id="${h.id}" style="width:auto;padding:0.25rem 0.5rem;font-size:0.75rem;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:4px;">Reject</button>
              <button type="button" class="btn-holiday-extend btn btn-sm btn-outline" data-id="${h.id}" data-from="${escapeHtml(h.dateFrom || "")}" data-to="${escapeHtml(h.dateTo || "")}" data-name="${escapeHtml(h.employeeName || "—")}" style="width:auto;padding:0.25rem 0.5rem;font-size:0.75rem;margin-right:4px;">Extend</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  listEl.querySelectorAll(".btn-holiday-approve").forEach((btn) => {
    btn.addEventListener("click", () => handleAdminHolidayAction(btn.dataset.id, "approved"));
  });
  listEl.querySelectorAll(".btn-holiday-reject").forEach((btn) => {
    btn.addEventListener("click", () => handleAdminHolidayAction(btn.dataset.id, "rejected"));
  });
  listEl.querySelectorAll(".btn-holiday-extend").forEach((btn) => {
    btn.addEventListener("click", () => openExtendHolidayModal(btn.dataset));
  });
}

async function handleAdminHolidayAction(holidayId, status) {
  if (!holidayId) return;
  try {
    await updateDoc(doc(db, "holidays", holidayId), {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null
    });
    showMessage(`Holiday ${status}.`, false);
    await loadAdminHolidays();
  } catch (err) {
    console.error("Holiday action failed:", err);
    showMessage("Failed: " + (err.message || err), true);
  }
}

let extendHolidayId = null;

function openExtendHolidayModal(dataset) {
  extendHolidayId = dataset.id;
  const modal = document.getElementById("admin-holiday-extend-modal");
  const desc = document.getElementById("admin-extend-holiday-desc");
  const inp = document.getElementById("admin-extend-new-date");
  if (desc) desc.textContent = `Extend holiday for ${dataset.name || "employee"} (current end: ${dataset.to || "—"})`;
  if (inp) inp.value = dataset.to || "";
  if (modal) modal.style.display = "flex";
}

function closeExtendHolidayModal() {
  extendHolidayId = null;
  const modal = document.getElementById("admin-holiday-extend-modal");
  if (modal) modal.style.display = "none";
}

async function confirmExtendHoliday() {
  if (!extendHolidayId) return;
  const inp = document.getElementById("admin-extend-new-date");
  const newDate = inp?.value?.trim();
  if (!newDate) {
    showMessage("Please enter a new end date.", true);
    return;
  }
  try {
    await updateDoc(doc(db, "holidays", extendHolidayId), {
      dateTo: newDate,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null
    });
    showMessage("Holiday extended.", false);
    closeExtendHolidayModal();
    await loadAdminHolidays();
  } catch (err) {
    console.error("Extend failed:", err);
    showMessage("Failed: " + (err.message || err), true);
  }
}

function showPanel(sectionId) {
  document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".admin-nav-link").forEach((a) => a.classList.remove("active"));
  const panel = document.getElementById("panel-" + sectionId);
  const link = document.querySelector('.admin-nav-link[data-section="' + sectionId + '"]');
  if (panel) panel.classList.add("active");
  if (link) link.classList.add("active");
  if (sectionId === "add-employee") loadEmployeeRecords();
  if (sectionId === "holidays") loadAdminHolidays();
  if (sectionId === "punch-records") loadPunchRecords(db);
  if (sectionId === "production-log") {
    loadProductionLogItems();
    if (typeof initProductionLog === "function") {
      setTimeout(() => initProductionLog(), 50);
    }
  }
}

const COLLECTION_MACHINE_OPS = "rates_machineOperators";
const COLLECTION_PRODUCTIONS = "rates_productions";
const COLLECTION_DAILY = "rates_daily";
const COLLECTION_SELLING = "rates_selling";

function normalizeText(v) {
  return String(v == null ? "" : v).trim();
}

function isFibreCategory(category) {
  const c = normalizeText(category).toLowerCase();
  return c === "fiber" || c === "fibre";
}

function isFinishedProductCategory(category) {
  const c = normalizeText(category).replace(/\s+/g, " ").toLowerCase();
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

async function loadProductionLogItems() {
  const itemFilterEl = document.getElementById("fl-item");
  if (!itemFilterEl) return;

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
    let options = '<option value="all">All Items</option>';
    names.forEach((n) => {
      options += `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`;
    });
    itemFilterEl.innerHTML = options;
  } catch (err) {
    console.error("Failed to load production log items:", err);
  }
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

function renderSellingRates(listEl, items) {
  if (!listEl) return;
  if (items.length === 0) {
    listEl.innerHTML = "<p class='empty-msg'>No selling rates yet. Add one above (finished products only).</p>";
    return;
  }
  let html = `<table class="admin-table"><thead><tr><th>Product</th><th>Unit</th><th>Selling price (Rs.)</th><th>Actions</th></tr></thead><tbody>`;
  for (const x of items) {
    const name = escapeHtml(x.productName || x.name || "—");
    const unit = escapeHtml(x.unit || "piece");
    const rate = Number(x.sellingPrice ?? x.rate ?? 0);
    html += `<tr data-id="${x.id}">
      <td>${name}</td>
      <td>${unit}</td>
      <td><input type="number" class="inline-edit" data-id="${x.id}" value="${rate}" min="0" step="0.01" data-collection="${COLLECTION_SELLING}"></td>
      <td><button type="button" class="btn btn-sm btn-danger btn-rate-remove" data-id="${x.id}" data-collection="${COLLECTION_SELLING}">Remove</button></td>
    </tr>`;
  }
  html += "</tbody></table>";
  listEl.innerHTML = html;
  attachRateListeners(listEl);
}

async function loadSellingProductOptions() {
  const sel = document.getElementById("sellingProductName");
  if (!sel) return;
  const currentValue = sel.value;
  try {
    const [invSnap, ratesSnap] = await Promise.all([
      getDocs(collection(db, "inventory")),
      getDocs(collection(db, COLLECTION_SELLING))
    ]);
    const namesSet = new Set();
    invSnap.forEach((d) => {
      const item = d.data() || {};
      if (!isFinishedProductCategory(item.category)) return;
      const n = normalizeText(item.name);
      if (n) namesSet.add(n);
    });
    ratesSnap.forEach((d) => {
      const r = d.data() || {};
      const n = normalizeText(r.productName || r.name);
      if (n) namesSet.add(n);
    });
    const names = Array.from(namesSet).sort((a, b) => a.localeCompare(b));
    const options = [
      `<option value="">Select product</option>`,
      ...names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`),
      `<option value="__other__">Other (type manually)</option>`
    ];
    sel.innerHTML = options.join("");
    const shouldKeep = names.includes(currentValue) || currentValue === "__other__" || currentValue === "";
    sel.value = shouldKeep ? currentValue : "";
  } catch (err) {
    console.error("Failed to load selling product options:", err);
    sel.innerHTML = `<option value="">Select product</option><option value="__other__">Other (type manually)</option>`;
  }
  toggleOtherSellingProductInput();
}

function toggleOtherSellingProductInput() {
  const sel = document.getElementById("sellingProductName");
  const wrap = document.getElementById("sellingProductNameOtherWrap");
  const otherInput = document.getElementById("sellingProductNameOther");
  if (!sel || !wrap || !otherInput) return;
  const isOther = sel.value === "__other__";
  wrap.style.display = isOther ? "block" : "none";
  otherInput.required = isOther;
  if (!isOther) otherInput.value = "";
}

function getSelectedSellingProductName() {
  const sel = document.getElementById("sellingProductName");
  const otherInput = document.getElementById("sellingProductNameOther");
  if (!sel) return "";
  if (sel.value === "__other__") return normalizeText(otherInput?.value);
  return normalizeText(sel.value);
}

async function addSellingRate() {
  hideMessage();
  const name = getSelectedSellingProductName();
  const unit = document.getElementById("sellingUnit")?.value?.trim() || "piece";
  const price = parseFloat(document.getElementById("sellingPrice")?.value);
  if (!name) {
    showMessage("Select or enter product name.", true);
    return;
  }
  if (price == null || isNaN(price) || price < 0) {
    showMessage("Enter a valid selling price.", true);
    return;
  }
  try {
    await addDoc(collection(db, COLLECTION_SELLING), {
      productName: name,
      name: name,
      unit,
      sellingPrice: Number(price),
      rate: Number(price)
    });
    showMessage("Selling rate added.");
    document.getElementById("sellingProductName").value = "";
    document.getElementById("sellingProductNameOther").value = "";
    document.getElementById("sellingPrice").value = "";
    toggleOtherSellingProductInput();
    loadAllRates();
  } catch (err) {
    showMessage("Failed to add: " + (err.message || err), true);
  }
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
    } else if (collectionName === COLLECTION_SELLING) {
      await setDoc(ref, { ...existing, sellingPrice: numberValue, rate: numberValue }, { merge: true });
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
  const listSelling = document.getElementById("listSelling");
  try {
    listMachineOps && (listMachineOps.innerHTML = "<p class='loading-msg'>Loading…</p>");
    listProductions && (listProductions.innerHTML = "<p class='loading-msg'>Loading…</p>");
    listDaily && (listDaily.innerHTML = "<p class='loading-msg'>Loading…</p>");
    listSelling && (listSelling.innerHTML = "<p class='loading-msg'>Loading…</p>");
    const [ops, prods, daily, selling] = await Promise.all([
      loadRates(COLLECTION_MACHINE_OPS),
      loadRates(COLLECTION_PRODUCTIONS),
      loadRates(COLLECTION_DAILY),
      loadRates(COLLECTION_SELLING)
    ]);
    renderMachineOps(listMachineOps, ops);
    renderProductions(listProductions, prods);
    renderDaily(listDaily, daily);
    renderSellingRates(listSelling, selling);
    loadSellingProductOptions();
  } catch (err) {
    showMessage("Failed to load rates: " + (err.message || err), true);
    listMachineOps && (listMachineOps.innerHTML = "<p class='error'>Failed to load.</p>");
    listProductions && (listProductions.innerHTML = "<p class='error'>Failed to load.</p>");
    listDaily && (listDaily.innerHTML = "<p class='error'>Failed to load.</p>");
    listSelling && (listSelling.innerHTML = "<p class='error'>Failed to load.</p>");
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

// Set dynamic default dates for production log filters
function setDefaultFilterDates() {
  const flFrom = document.getElementById("fl-from");
  const flTo = document.getElementById("fl-to");
  if (flTo) {
    flTo.value = new Date().toISOString().slice(0, 10);
  }
  if (flFrom) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    flFrom.value = thirtyDaysAgo.toISOString().slice(0, 10);
  }
}

function init() {
  createModal();
  loadUsers();
  loadAllRates();
  loadFibreOptionsFromInventory();
  loadProductOptionsFromInventory();
  loadEmployeeUserRefs();
  setDefaultFilterDates();

  document.querySelectorAll(".admin-nav-link").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const section = a.getAttribute("data-section");
      if (section) showPanel(section);
    });
    a.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const section = a.getAttribute("data-section");
        if (section) showPanel(section);
      }
    });
  });

  document.getElementById("fl-refresh")?.addEventListener("click", () => {
    loadProductionLogItems();
    if (typeof initProductionLog === "function") initProductionLog();
  });

  document.getElementById("admin-holiday-refresh")?.addEventListener("click", loadAdminHolidays);
  document.getElementById("admin-holiday-filter-employee")?.addEventListener("change", renderAdminHolidays);
  document.getElementById("admin-holiday-filter-status")?.addEventListener("change", renderAdminHolidays);
  document.getElementById("admin-extend-cancel")?.addEventListener("click", closeExtendHolidayModal);
  document.getElementById("admin-extend-confirm")?.addEventListener("click", confirmExtendHoliday);
  setPunchDeleteSuccessCallback((msg) => showMessage(msg));
  document.getElementById("punch-records-refresh")?.addEventListener("click", () => loadPunchRecords(db));
  document.getElementById("punch-records-filter-employee")?.addEventListener("change", renderPunchRecords);
  document.getElementById("punch-records-filter-date-from")?.addEventListener("change", renderPunchRecords);
  document.getElementById("punch-records-filter-date-to")?.addEventListener("change", renderPunchRecords);
  document.getElementById("punch-reset-btn")?.addEventListener("click", async () => {
    const dateEl = document.getElementById("punch-reset-date");
    const empEl = document.getElementById("punch-reset-employee");
    const date = dateEl?.value?.trim();
    const empId = empEl?.value?.trim() || null;
    if (!date) {
      showMessage("Please select a date to reset.", true);
      return;
    }
    const scope = empId ? "for selected employee" : "for all employees";
    if (!confirm(`Reset all punch records on ${date} ${scope}? This cannot be undone.`)) return;
    const btn = document.getElementById("punch-reset-btn");
    const orig = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = "Resetting…"; }
    try {
      await resetPunchRecords(db, date, empId, (count) => {
        showMessage(`Reset ${count} punch record(s).`, false);
        loadPunchRecords(db);
      });
    } catch (err) {
      console.error("Reset punches failed:", err);
      showMessage("Failed to reset: " + (err.message || err), true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = orig || "Reset Punches"; }
    }
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
      const found = resolveEmployeeFromRef(document.getElementById("newUserRef")?.value);
      if (!found) {
        showMessage("Please select a valid employee Name/ID from records.", true);
        return;
      }
      if (!found.email) {
        showMessage("Selected employee does not have an email in records.", true);
        return;
      }
      const email = found.email.trim();
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

  document.getElementById("sellingProductName")?.addEventListener("change", toggleOtherSellingProductInput);
  document.getElementById("formSelling")?.addEventListener("submit", (e) => {
    e.preventDefault();
    addSellingRate();
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
