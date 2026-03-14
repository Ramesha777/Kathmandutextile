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
