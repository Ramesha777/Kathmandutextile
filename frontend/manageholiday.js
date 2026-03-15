// manageholiday.js — Grant holiday & view employee schedule
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const COLLECTION_HOLIDAYS = "holidays";
const COLLECTION_EMPLOYEES = "employees";

let employees = [];
let holidays = [];
let currentUserCanDelete = false;

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
  const selSchedule = document.getElementById("holiday-schedule-employee");
  if (!selGrant || !selSchedule) return;

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
  selSchedule.innerHTML = opts;
}

function renderScheduleForEmployee(empId, canDelete = false) {
  const listEl = document.getElementById("holiday-schedule-list");
  if (!listEl) return;

  if (!empId) {
    listEl.innerHTML =
      '<p style="padding:1.5rem;text-align:center;color:#64748b;">Select an employee to view their holiday schedule.</p>';
    return;
  }

  const empHolidays = holidays
    .filter((h) => h.employeeId === empId)
    .sort((a, b) => (b.dateFrom || "").localeCompare(a.dateFrom || ""));

  if (empHolidays.length === 0) {
    listEl.innerHTML =
      '<p style="padding:1.5rem;text-align:center;color:#64748b;">No holidays scheduled.</p>';
    return;
  }

  function statusBadge(s) {
    const st = (s || "pending").toLowerCase();
    const colors = { approved: "#10b981", rejected: "#ef4444", pending: "#f59e0b" };
    const c = colors[st] || "#64748b";
    return `<span style="padding:0.2rem 0.5rem;border-radius:6px;font-size:0.8rem;background:${c}33;color:${c};font-weight:600;">${escapeHtml(st)}</span>`;
  }

  listEl.innerHTML = `
    <table class="manager-table" style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:rgba(0,0,0,0.2);">
          <th style="padding:0.6rem 0.8rem;text-align:left;font-size:0.85rem;">From</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;font-size:0.85rem;">To</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;font-size:0.85rem;">Type</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;font-size:0.85rem;">Status</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;font-size:0.85rem;">Notes</th>
          <th style="padding:0.6rem 0.8rem;font-size:0.85rem;"></th>
        </tr>
      </thead>
      <tbody>
        ${empHolidays
          .map(
            (h) => `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
            <td style="padding:0.6rem 0.8rem;font-size:0.9rem;">${escapeHtml(
              h.dateFrom || "—"
            )}</td>
            <td style="padding:0.6rem 0.8rem;font-size:0.9rem;">${escapeHtml(
              h.dateTo || "—"
            )}</td>
            <td style="padding:0.6rem 0.8rem;font-size:0.9rem;">${escapeHtml(
              h.type || "—"
            )}</td>
            <td style="padding:0.6rem 0.8rem;font-size:0.9rem;">${statusBadge(h.status)}</td>
            <td style="padding:0.6rem 0.8rem;font-size:0.9rem;color:#94a3b8;">${escapeHtml(
              h.notes || "—"
            )}</td>
            <td style="padding:0.6rem 0.8rem;">
              ${canDelete ? `<button type="button" class="btn-holiday-delete btn btn-outline" data-id="${h.id}" style="padding:0.3rem 0.6rem;font-size:0.8rem;">Delete</button>` : "—"}
            </td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  listEl.querySelectorAll(".btn-holiday-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (!id || !confirm("Remove this holiday?")) return;
      try {
        await deleteDoc(doc(db, COLLECTION_HOLIDAYS, id));
        showToast("Holiday removed", "success");
        await loadHolidays();
        renderScheduleForEmployee(empId, canDelete);
      } catch (err) {
        showToast("Failed to remove: " + (err.message || err), "error");
      }
    });
  });
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
    const selSchedule = document.getElementById("holiday-schedule-employee");
    if (selSchedule?.value === empId) {
      renderScheduleForEmployee(empId, currentUserCanDelete);
    }
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
  currentUserCanDelete = (await getCurrentUserRole()) === "admin";

  const form = document.getElementById("holiday-grant-form");
  const selSchedule = document.getElementById("holiday-schedule-employee");

  if (form) {
    form.removeEventListener("submit", handleGrantHoliday);
    form.addEventListener("submit", handleGrantHoliday);
  }

  if (selSchedule && !selSchedule.dataset.holidayInitialized) {
    selSchedule.dataset.holidayInitialized = "true";
    selSchedule.addEventListener("change", () =>
      renderScheduleForEmployee(selSchedule.value, currentUserCanDelete)
    );
  }

  renderScheduleForEmployee(selSchedule?.value || "", currentUserCanDelete);
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
