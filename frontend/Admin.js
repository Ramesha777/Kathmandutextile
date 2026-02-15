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
const addForm = document.getElementById("addEmployeeForm");
const userListEl = document.getElementById("userList");
const adminMessage = document.getElementById("adminMessage");
const logoutBtn = document.getElementById("logoutBtn");

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
    const users = [];
    snap.forEach((d) => {
      users.push({ uid: d.id, ...d.data() });
    });
    users.sort((a, b) => (a.email || a.uid || "").localeCompare(b.email || b.uid || ""));
    renderUserTable(users);
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

async function removeUser(uid) {
  if (!confirm("Remove this user from the app? They will no longer be able to sign in. (Their Firebase Auth account will remain until removed via Firebase Console or backend.)")) return;
  hideMessage();
  try {
    await deleteDoc(doc(db, "users", uid));
    showMessage("User removed from database.");
    loadUsers();
  } catch (err) {
    showMessage("Failed to remove user: " + (err.message || err), true);
  }
}

async function addEmployee(email, password, role) {
  hideMessage();
  if (!email || !password || !role) {
    showMessage("Please fill email, password, and role.", true);
    return;
  }
  if (!ROLES.includes(role)) {
    showMessage("Invalid role.", true);
    return;
  }
  const submitBtn = addForm?.querySelector('button[type="submit"]');
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
      submitBtn.textContent = "Add Employee";
    }
  }
}

// ─── Payment rates: Machine Operators (fibres /m) ───
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

function showPanel(sectionId) {
  document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".admin-nav-link").forEach((a) => a.classList.remove("active"));
  const panel = document.getElementById("panel-" + sectionId);
  const link = document.querySelector('.admin-nav-link[data-section="' + sectionId + '"]');
  if (panel) panel.classList.add("active");
  if (link) link.classList.add("active");
}

function init() {
  loadUsers();
  loadAllRates();

  document.querySelectorAll(".admin-nav-link").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const section = a.getAttribute("data-section");
      if (section) showPanel(section);
    });
  });

  if (addForm) {
    addForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("newEmail")?.value?.trim();
      const password = document.getElementById("newPassword")?.value;
      const role = document.getElementById("newRole")?.value;
      addEmployee(email, password, role);
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
