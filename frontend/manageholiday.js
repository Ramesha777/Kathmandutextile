// manageholiday.js — Manager holiday requests & holidays list
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  deleteField,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const COLLECTION_HOLIDAYS = "holidays";
const COLLECTION_EMPLOYEES = "employees";

let employees = [];
let holidays = [];
/** Only admins may approve/reject holidays in the manager holidays table (UI + handleManagerHolidayAction). */
let currentUserIsAdmin = false;

const toastEl = document.getElementById("toast");

function showToast(msg, type = "success") {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = `toast ${type} show`;
  setTimeout(() => toastEl.classList.remove("show"), 3000);
}

function escapeHtml(str) {
  if (!str) return "—";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function loadEmployees() {
  try {
    const snap = await getDocs(collection(db, COLLECTION_EMPLOYEES));
    employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return employees;
  } catch (err) {
    console.error("loadEmployees failed:", err);
    showToast("Failed to load employees", "error");
    return [];
  }
}

async function loadHolidays() {
  try {
    const snap = await getDocs(collection(db, COLLECTION_HOLIDAYS));
    holidays = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return holidays;
  } catch (err) {
    console.error("loadHolidays failed:", err);
    showToast("Failed to load holidays", "error");
    return [];
  }
}

function populateEmployeeSelects() {
  const selGrant = document.getElementById("holiday-employee");
  if (!selGrant) return;

  const opts =
    '<option value="">Select employee</option>' +
    employees
      .map(
        (e) =>
          `<option value="${e.id}">${escapeHtml(
            e.fullName || e.name || e.email || e.id
          )} (${escapeHtml(e.department || "—")})</option>`
      )
      .join("");

  selGrant.innerHTML = opts;
}

function managerHolidayStatusBadge(s) {
  const st = (s || "pending").toLowerCase();
  const colors = { approved: "#10b981", rejected: "#ef4444", pending: "#f59e0b" };
  const c = colors[st] || "#64748b";
  return `<span style="padding:0.2rem 0.5rem;border-radius:6px;font-size:0.8rem;background:${c}33;color:${c};font-weight:600;">${escapeHtml(st)}</span>`;
}

function populateManagerHolidayFilter() {
  const filterEl = document.getElementById("manager-holiday-filter-employee");
  if (!filterEl) return;
  const empIds = [...new Set(holidays.map((h) => h.employeeId).filter(Boolean))];
  const currentVal = filterEl.value;
  filterEl.innerHTML =
    "<option value=''>All employees</option>" +
    empIds
      .map((eid) => {
        const emp = employees.find((e) => e.id === eid);
        const name = emp ? emp.fullName || emp.name || emp.id : eid;
        return `<option value="${escapeHtml(eid)}">${escapeHtml(name)}</option>`;
      })
      .join("");
  if (currentVal && empIds.includes(currentVal)) filterEl.value = currentVal;
}

function renderManagerHolidays() {
  const listEl = document.getElementById("manager-holidays-list");
  const filterEl = document.getElementById("manager-holiday-filter-employee");
  const statusFilterEl = document.getElementById("manager-holiday-filter-status");
  if (!listEl) return;
  const empFilter = filterEl?.value?.trim() || "";
  const statusFilter = statusFilterEl?.value?.trim() || "";
  let items = holidays;
  if (empFilter) items = items.filter((h) => h.employeeId === empFilter);
  if (statusFilter)
    items = items.filter((h) => (h.status || "pending").toLowerCase() === statusFilter.toLowerCase());

  if (items.length === 0) {
    listEl.innerHTML =
      "<p style='padding:2rem;text-align:center;color:#64748b;'>No holiday records found.</p>";
    return;
  }

  listEl.innerHTML = `
    <table class="manager-table" style="width:100%;border-collapse:collapse;">
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
        ${items
          .map(
            (h) => `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.06);" data-id="${escapeHtml(h.id)}">
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(h.employeeName || h.employeeId || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(h.dateFrom || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(h.dateTo || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(h.type || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">${managerHolidayStatusBadge(h.status)}</td>
            <td style="padding:0.6rem 0.8rem;color:#94a3b8;">
              ${escapeHtml(h.notes || "—")}
              ${
                (h.extendRequestStatus || "").toLowerCase() === "pending" && h.extendRequestNewDate
                  ? `<div style="margin-top:6px;font-size:0.78rem;color:#f59e0b;font-weight:600;">Extend requested → ${escapeHtml(h.extendRequestNewDate)}</div>`
                  : ""
              }
            </td>
            <td style="padding:0.6rem 0.8rem;white-space:nowrap;">
              ${
                currentUserIsAdmin
                  ? `<button type="button" class="btn-mgr-holiday-approve btn btn-sm" data-id="${h.id}" style="width:auto;padding:0.25rem 0.5rem;font-size:0.75rem;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:4px;">Approve</button>
              <button type="button" class="btn-mgr-holiday-reject btn btn-sm" data-id="${h.id}" style="width:auto;padding:0.25rem 0.5rem;font-size:0.75rem;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:4px;">Reject</button>
              `
                  : ""
              }
              ${
                currentUserIsAdmin &&
                (h.extendRequestStatus || "").toLowerCase() === "pending" &&
                h.extendRequestNewDate
                  ? `<button type="button" class="btn-mgr-holiday-apply-extend btn btn-sm" data-id="${h.id}" style="width:auto;padding:0.25rem 0.5rem;font-size:0.75rem;background:#0ea5e9;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:4px;">Apply extend</button>
              <button type="button" class="btn-mgr-holiday-reject-extend btn btn-sm" data-id="${h.id}" style="width:auto;padding:0.25rem 0.5rem;font-size:0.75rem;background:#64748b;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:4px;">Dismiss extend</button>
              `
                  : ""
              }
              ${
                currentUserIsAdmin
                  ? `<button type="button" class="btn-mgr-holiday-extend btn btn-sm btn-outline" data-id="${h.id}" data-from="${escapeHtml(h.dateFrom || "")}" data-to="${escapeHtml(h.dateTo || "")}" data-name="${escapeHtml(h.employeeName || "—")}" style="width:auto;padding:0.25rem 0.5rem;font-size:0.75rem;margin-right:4px;">Extend</button>`
                  : (h.extendRequestStatus || "").toLowerCase() === "pending"
                    ? `<span style="font-size:0.75rem;color:#94a3b8;">Extend request pending</span>`
                    : `<button type="button" class="btn-mgr-holiday-request-extend btn btn-sm btn-outline" data-id="${h.id}" data-from="${escapeHtml(h.dateFrom || "")}" data-to="${escapeHtml(h.dateTo || "")}" data-name="${escapeHtml(h.employeeName || "—")}" style="width:auto;padding:0.25rem 0.5rem;font-size:0.75rem;margin-right:4px;">Request extend</button>`
              }
            </td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  listEl.querySelectorAll(".btn-mgr-holiday-approve").forEach((btn) => {
    btn.addEventListener("click", () => handleManagerHolidayAction(btn.dataset.id, "approved"));
  });
  listEl.querySelectorAll(".btn-mgr-holiday-reject").forEach((btn) => {
    btn.addEventListener("click", () => handleManagerHolidayAction(btn.dataset.id, "rejected"));
  });
  listEl.querySelectorAll(".btn-mgr-holiday-extend").forEach((btn) => {
    btn.addEventListener("click", () => openManagerExtendHolidayModal(btn.dataset, "admin-direct"));
  });
  listEl.querySelectorAll(".btn-mgr-holiday-request-extend").forEach((btn) => {
    btn.addEventListener("click", () => openManagerExtendHolidayModal(btn.dataset, "manager-request"));
  });
  listEl.querySelectorAll(".btn-mgr-holiday-apply-extend").forEach((btn) => {
    btn.addEventListener("click", () => handleApplyExtendRequest(btn.dataset.id));
  });
  listEl.querySelectorAll(".btn-mgr-holiday-reject-extend").forEach((btn) => {
    btn.addEventListener("click", () => handleRejectExtendRequest(btn.dataset.id));
  });
}

async function handleManagerHolidayAction(holidayId, status) {
  if (!holidayId) return;
  if ((await getCurrentUserRole()) !== "admin") {
    showToast("Only an admin can approve or reject holidays.", "error");
    return;
  }
  try {
    await updateDoc(doc(db, COLLECTION_HOLIDAYS, holidayId), {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    });
    showToast(`Holiday ${status}.`, "success");
    await loadHolidays();
    refreshManagerHolidayUI();
  } catch (err) {
    console.error("Holiday action failed:", err);
    showToast("Failed: " + (err.message || err), "error");
  }
}

let managerExtendHolidayId = null;
/** "admin-direct" = set end date immediately (admin). "manager-request" = submit pending extend for admin. */
let managerExtendMode = "admin-direct";

function openManagerExtendHolidayModal(dataset, mode) {
  managerExtendHolidayId = dataset.id;
  managerExtendMode = mode === "manager-request" ? "manager-request" : "admin-direct";
  const modal = document.getElementById("manager-holiday-extend-modal");
  const title = document.getElementById("manager-extend-modal-title");
  const desc = document.getElementById("manager-extend-holiday-desc");
  const label = document.getElementById("manager-extend-date-label");
  const inp = document.getElementById("manager-extend-new-date");
  const confirmBtn = document.getElementById("manager-extend-confirm");
  const isRequest = managerExtendMode === "manager-request";
  if (title) title.textContent = isRequest ? "Request extend leave" : "Extend holiday";
  if (label) label.textContent = isRequest ? "Requested new end date" : "New end date";
  if (desc) {
    desc.textContent = isRequest
      ? `Submit a request to extend leave for ${dataset.name || "employee"}. Current approved end: ${dataset.to || "—"}. An admin will approve or dismiss the request.`
      : `Extend holiday for ${dataset.name || "employee"} (current end: ${dataset.to || "—"})`;
  }
  if (inp) inp.value = dataset.to || "";
  if (confirmBtn) confirmBtn.textContent = isRequest ? "Submit request" : "Extend";
  if (modal) modal.style.display = "flex";
}

function closeManagerExtendHolidayModal() {
  managerExtendHolidayId = null;
  const modal = document.getElementById("manager-holiday-extend-modal");
  if (modal) modal.style.display = "none";
}

async function confirmManagerExtendHoliday() {
  if (!managerExtendHolidayId) return;
  const inp = document.getElementById("manager-extend-new-date");
  const newDate = inp?.value?.trim();
  if (!newDate) {
    showToast("Please enter a new end date.", "error");
    return;
  }

  if (managerExtendMode === "manager-request") {
    if ((await getCurrentUserRole()) !== "manager") {
      showToast("Only managers submit extend requests from this action.", "error");
      return;
    }
    const h = holidays.find((x) => x.id === managerExtendHolidayId);
    const currentEnd = h?.dateTo || "";
    if (currentEnd && newDate <= currentEnd) {
      showToast("Choose a new end date after the current end date.", "error");
      return;
    }
    if (h?.dateFrom && newDate < h.dateFrom) {
      showToast("Requested end date must be on or after the leave start date.", "error");
      return;
    }
    try {
      await updateDoc(doc(db, COLLECTION_HOLIDAYS, managerExtendHolidayId), {
        extendRequestNewDate: newDate,
        extendRequestStatus: "pending",
        extendRequestedAt: serverTimestamp(),
        extendRequestedBy: auth.currentUser?.uid || null,
      });
      showToast("Extend request submitted for admin approval.", "success");
      closeManagerExtendHolidayModal();
      await loadHolidays();
      refreshManagerHolidayUI();
    } catch (err) {
      console.error("Extend request failed:", err);
      showToast("Failed: " + (err.message || err), "error");
    }
    return;
  }

  if ((await getCurrentUserRole()) !== "admin") {
    showToast("Only an admin can apply a direct extension.", "error");
    return;
  }
  try {
    await updateDoc(doc(db, COLLECTION_HOLIDAYS, managerExtendHolidayId), {
      dateTo: newDate,
      extendRequestNewDate: deleteField(),
      extendRequestStatus: deleteField(),
      extendRequestedAt: deleteField(),
      extendRequestedBy: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    });
    showToast("Holiday extended.", "success");
    closeManagerExtendHolidayModal();
    await loadHolidays();
    refreshManagerHolidayUI();
  } catch (err) {
    console.error("Extend failed:", err);
    showToast("Failed: " + (err.message || err), "error");
  }
}

async function handleApplyExtendRequest(holidayId) {
  if (!holidayId) return;
  if ((await getCurrentUserRole()) !== "admin") {
    showToast("Only an admin can approve an extend request.", "error");
    return;
  }
  const h = holidays.find((x) => x.id === holidayId);
  if (!h || (h.extendRequestStatus || "").toLowerCase() !== "pending" || !h.extendRequestNewDate) return;
  try {
    await updateDoc(doc(db, COLLECTION_HOLIDAYS, holidayId), {
      dateTo: h.extendRequestNewDate,
      extendRequestNewDate: deleteField(),
      extendRequestStatus: deleteField(),
      extendRequestedAt: deleteField(),
      extendRequestedBy: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    });
    showToast("Extend request applied.", "success");
    await loadHolidays();
    refreshManagerHolidayUI();
  } catch (err) {
    console.error("Apply extend failed:", err);
    showToast("Failed: " + (err.message || err), "error");
  }
}

async function handleRejectExtendRequest(holidayId) {
  if (!holidayId) return;
  if ((await getCurrentUserRole()) !== "admin") {
    showToast("Only an admin can dismiss an extend request.", "error");
    return;
  }
  if (!confirm("Dismiss this extend request? The end date will stay unchanged.")) return;
  try {
    await updateDoc(doc(db, COLLECTION_HOLIDAYS, holidayId), {
      extendRequestNewDate: deleteField(),
      extendRequestStatus: deleteField(),
      extendRequestedAt: deleteField(),
      extendRequestedBy: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    });
    showToast("Extend request dismissed.", "success");
    await loadHolidays();
    refreshManagerHolidayUI();
  } catch (err) {
    console.error("Dismiss extend failed:", err);
    showToast("Failed: " + (err.message || err), "error");
  }
}

function refreshManagerHolidayUI() {
  populateManagerHolidayFilter();
  renderManagerHolidays();
}

let managerHolidayListWired = false;

function wireManagerHolidayListEvents() {
  if (managerHolidayListWired) return;
  managerHolidayListWired = true;
  document.getElementById("manager-holiday-refresh")?.addEventListener("click", async () => {
    const listEl = document.getElementById("manager-holidays-list");
    if (listEl)
      listEl.innerHTML =
        "<p style='padding:2rem;text-align:center;color:#64748b;'>Loading holiday data…</p>";
    await loadHolidays();
    refreshManagerHolidayUI();
  });
  document.getElementById("manager-holiday-filter-employee")?.addEventListener("change", renderManagerHolidays);
  document.getElementById("manager-holiday-filter-status")?.addEventListener("change", renderManagerHolidays);
  document.getElementById("manager-extend-cancel")?.addEventListener("click", closeManagerExtendHolidayModal);
  document.getElementById("manager-extend-confirm")?.addEventListener("click", confirmManagerExtendHoliday);
}

async function handleGrantHoliday(e) {
  e.preventDefault();
  const selEmployee = document.getElementById("holiday-employee");
  const inpFrom = document.getElementById("holiday-date-from");
  const inpTo = document.getElementById("holiday-date-to");
  const selType = document.getElementById("holiday-type");
  const inpNotes = document.getElementById("holiday-notes");
  const btn = document.getElementById("btn-grant-holiday");

  const empId = selEmployee?.value?.trim();
  const dateFrom = inpFrom?.value?.trim();
  const dateTo = inpTo?.value?.trim();
  const type = selType?.value || "Annual";
  const notes = inpNotes?.value?.trim() || "";

  if (!empId || !dateFrom || !dateTo) {
    showToast("Please select employee and dates.", "error");
    return;
  }
  if (dateTo < dateFrom) {
    showToast("To date must be on or after From date.", "error");
    return;
  }

  const emp = employees.find((e) => e.id === empId);
  const employeeName = emp ? emp.fullName || emp.name || emp.id : empId;

  const originalText = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }

  try {
    await addDoc(collection(db, COLLECTION_HOLIDAYS), {
      employeeId: empId,
      employeeName,
      dateFrom,
      dateTo,
      type,
      notes,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    showToast(`Holiday granted for ${employeeName}`, "success");
    if (inpFrom) inpFrom.value = "";
    if (inpTo) inpTo.value = "";
    if (inpNotes) inpNotes.value = "";
    await loadHolidays();
    refreshManagerHolidayUI();
  } catch (err) {
    console.error("Grant holiday failed:", err);
    showToast("Failed to grant holiday: " + (err.message || err), "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText || "Grant Holiday";
    }
  }
}

async function getCurrentUserRole() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return (snap.data().role || "").trim().toLowerCase();
}

export async function loadHolidayPanel() {
  await loadEmployees();
  await loadHolidays();
  populateEmployeeSelects();
  currentUserIsAdmin = (await getCurrentUserRole()) === "admin";

  const listEl = document.getElementById("manager-holidays-list");
  if (listEl)
    listEl.innerHTML =
      "<p style='padding:2rem;text-align:center;color:#64748b;'>Loading holiday data…</p>";
  refreshManagerHolidayUI();
  wireManagerHolidayListEvents();

  const form = document.getElementById("holiday-grant-form");

  if (form) {
    form.removeEventListener("submit", handleGrantHoliday);
    form.addEventListener("submit", handleGrantHoliday);
  }
}

// ─── Admin: Book Holiday (admin can directly book holiday for employees, auto-approved) ───
let adminEmployeesForBook = [];
let adminBookHolidayFormWired = false;
let adminBookHolidayOnSuccess = null;

function showAdminHolidayMessage(msg, isError = false) {
  const adminMsg = document.getElementById("adminMessage");
  if (adminMsg) {
    adminMsg.textContent = msg;
    adminMsg.className = "admin-message " + (isError ? "error" : "success");
    adminMsg.style.display = "block";
    setTimeout(() => (adminMsg.style.display = "none"), 5000);
  } else if (toastEl) {
    showToast(msg, isError ? "error" : "success");
  }
}

function onAdminBookHolidayEmployeeIdInput() {
  const inpId = document.getElementById("admin-book-holiday-employee-id");
  const inpName = document.getElementById("admin-book-holiday-employee-name");
  if (!inpId || !inpName) return;
  const id = inpId.value.trim();
  if (!id) {
    inpName.value = "";
    inpName.placeholder = "Enter ID to populate";
    return;
  }
  const emp = adminEmployeesForBook.find((e) => e.id === id);
  if (emp) {
    inpName.value = emp.fullName || emp.name || emp.email || emp.id;
    inpName.placeholder = "";
  } else {
    inpName.value = "";
    inpName.placeholder = "No employee found for this ID";
  }
}

export async function initAdminBookHoliday(onSuccess) {
  adminBookHolidayOnSuccess = onSuccess || null;
  const form = document.getElementById("admin-book-holiday-form");
  const inpEmployeeId = document.getElementById("admin-book-holiday-employee-id");
  if (!form || !inpEmployeeId) return;

  try {
    const snap = await getDocs(collection(db, COLLECTION_EMPLOYEES));
    adminEmployeesForBook = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("initAdminBookHoliday: failed to load employees", err);
    showAdminHolidayMessage("Failed to load employees.", true);
    return;
  }

  if (!adminBookHolidayFormWired) {
    adminBookHolidayFormWired = true;
    inpEmployeeId.addEventListener("input", onAdminBookHolidayEmployeeIdInput);
    inpEmployeeId.addEventListener("change", onAdminBookHolidayEmployeeIdInput);
    form.addEventListener("submit", handleAdminBookHoliday);
  }

  onAdminBookHolidayEmployeeIdInput();
}

async function handleAdminBookHoliday(e) {
  e.preventDefault();
  const inpEmployeeId = document.getElementById("admin-book-holiday-employee-id");
  const inpEmployeeName = document.getElementById("admin-book-holiday-employee-name");
  const inpFrom = document.getElementById("admin-book-holiday-from");
  const inpTo = document.getElementById("admin-book-holiday-to");
  const selType = document.getElementById("admin-book-holiday-type");
  const inpNotes = document.getElementById("admin-book-holiday-notes");
  const btn = document.getElementById("admin-book-holiday-btn");

  const empId = inpEmployeeId?.value?.trim();
  const employeeName = inpEmployeeName?.value?.trim();
  const dateFrom = inpFrom?.value?.trim();
  const dateTo = inpTo?.value?.trim();
  const type = selType?.value || "Annual";
  const notes = inpNotes?.value?.trim() || "";

  if (!empId || !dateFrom || !dateTo) {
    showAdminHolidayMessage("Please enter employee ID and dates.", true);
    return;
  }
  if (!employeeName) {
    showAdminHolidayMessage("Enter a valid employee ID to populate the name.", true);
    return;
  }
  if (dateTo < dateFrom) {
    showAdminHolidayMessage("To date must be on or after From date.", true);
    return;
  }

  const originalText = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Booking...";
  }

  try {
    await addDoc(collection(db, COLLECTION_HOLIDAYS), {
      employeeId: empId,
      employeeName,
      dateFrom,
      dateTo,
      type,
      notes,
      status: "approved",
      bookedBy: "admin",
      createdAt: new Date().toISOString(),
    });
    showAdminHolidayMessage(`Holiday booked for ${employeeName} (${dateFrom} – ${dateTo})`, false);
    if (inpEmployeeId) inpEmployeeId.value = "";
    if (inpEmployeeName) inpEmployeeName.value = "";
    if (inpEmployeeName) inpEmployeeName.placeholder = "Enter ID to populate";
    if (inpFrom) inpFrom.value = "";
    if (inpTo) inpTo.value = "";
    if (inpNotes) inpNotes.value = "";
    if (typeof adminBookHolidayOnSuccess === "function") adminBookHolidayOnSuccess();
  } catch (err) {
    console.error("Admin book holiday failed:", err);
    showAdminHolidayMessage("Failed to book holiday: " + (err.message || err), true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText || "Book Holiday";
    }
  }
}
