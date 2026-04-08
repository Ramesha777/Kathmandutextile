// punchrecords.js — Daily summary (IN / OUT / total hours), Manager view, Admin add/edit/delete with alternating validation
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  addDoc,
  updateDoc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

let punchRecordsData = [];
let punchRecordsDb = null;
let cachedEmployees = [];
let onDeleteSuccessFn = null;
let punchListClickBound = false;

/** One attendance “day” = 24h from this clock time on the label date until same time next calendar day (night shifts stay with shift start day). */
const ATTENDANCE_CUTOVER_HOUR = 6;
const ATTENDANCE_CUTOVER_MINUTE = 0;

/** Max time inside the building per attendance day (sum of In→Out segments + open In). */
const MAX_SHIFT_HOURS = 12;
const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 60 * 60 * 1000;

export function setPunchDeleteSuccessCallback(fn) {
  onDeleteSuccessFn = fn;
}

function escapeHtml(str) {
  if (str == null || str === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

function parsePunchDate(p) {
  const ts = p._timestamp ?? p.timestamp;
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds != null) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

function formatPunchTime(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

function timeInputFromDate(d) {
  if (!d) return "";
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function ymdLocal(d) {
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Attendance day label (YYYY-MM-DD) for a local timestamp — before cutover counts as previous calendar day’s shift. */
function getAttendanceDateStrFromDate(d) {
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const mins = d.getHours() * 60 + d.getMinutes();
  const cutM = ATTENDANCE_CUTOVER_HOUR * 60 + ATTENDANCE_CUTOVER_MINUTE;
  let ref = new Date(y, m, day);
  if (mins < cutM) ref.setDate(ref.getDate() - 1);
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-${String(ref.getDate()).padStart(2, "0")}`;
}

function getAttendanceDateForPunch(p) {
  const d = parsePunchDate(p);
  if (d) return getAttendanceDateStrFromDate(d);
  return String(p.date || "").trim();
}

/** [start, end) 24h window for this attendance day label. */
function getAttendanceWindowBounds(attendanceDateStr) {
  const [y, mo, da] = attendanceDateStr.split("-").map((x) => parseInt(x, 10));
  const start = new Date(y, mo - 1, da, ATTENDANCE_CUTOVER_HOUR, ATTENDANCE_CUTOVER_MINUTE, 0, 0);
  const end = new Date(y, mo - 1, da + 1, ATTENDANCE_CUTOVER_HOUR, ATTENDANCE_CUTOVER_MINUTE, 0, 0);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

function combineDateTimeLocal(dateStr, timeStr) {
  const [hh, mm] = (timeStr || "00:00").split(":").map((x) => parseInt(x, 10));
  const [y, mo, da] = dateStr.split("-").map((x) => parseInt(x, 10));
  return new Date(y, mo - 1, da, hh || 0, mm || 0, 0, 0);
}

function cutoverHintText() {
  const h = ATTENDANCE_CUTOVER_HOUR % 12 || 12;
  const am = ATTENDANCE_CUTOVER_HOUR < 12 ? "AM" : "PM";
  const mm = String(ATTENDANCE_CUTOVER_MINUTE).padStart(2, "0");
  return `${h}:${mm} ${am}`;
}

/** Normalize to comparable rows: timeMs asc; same ms → In before Out; then id */
function toSortedTimeline(punches) {
  const rows = punches.map((p) => {
    const d = parsePunchDate(p);
    const timeMs = d ? d.getTime() : 0;
    const type = String(p.type || "in").toLowerCase() === "out" ? "out" : "in";
    return { id: p.id, type, timeMs, raw: p };
  });
  rows.sort((a, b) => {
    if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
    if (a.type !== b.type) return a.type === "in" ? -1 : 1;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  return rows;
}

/**
 * No two consecutive identical types; first punch of the day must be In.
 */
function validateAlternatingTimeline(sorted) {
  if (sorted.length === 0) return { ok: true, message: "" };
  if (sorted[0].type !== "in") {
    return { ok: false, message: "First punch in this attendance window must be In (cannot start with Out)." };
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].type === sorted[i - 1].type) {
      const a = sorted[i - 1].type === "in" ? "In" : "Out";
      return {
        ok: false,
        message: `Invalid: two ${a} punches in a row (times cannot be In→In or Out→Out).`,
      };
    }
  }
  return { ok: true, message: "" };
}

function computeTotalMsInside(sortedAsc, attendanceDateStr) {
  const { startMs, endMs } = getAttendanceWindowBounds(attendanceDateStr);
  const now = Date.now();
  const inCurrentWindow = now >= startMs && now < endMs;

  let total = 0;
  let i = 0;
  const n = sortedAsc.length;
  while (i < n) {
    if (sortedAsc[i].type !== "in") {
      i++;
      continue;
    }
    const start = sortedAsc[i].timeMs;
    if (i + 1 < n && sortedAsc[i + 1].type === "out") {
      total += Math.max(0, sortedAsc[i + 1].timeMs - start);
      i += 2;
    } else {
      let endCap = endMs;
      if (inCurrentWindow) endCap = Math.min(now, endMs);
      total += Math.max(0, endCap - start);
      i++;
    }
  }
  return total;
}

function formatDuration(ms) {
  if (ms <= 0 || Number.isNaN(ms)) return "—";
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm}m`;
  return `${h}h ${mm}m`;
}

function getEmployeeDept(empId) {
  const e = cachedEmployees.find((x) => x.id === empId);
  return e ? e.department || e.dept || "—" : "—";
}

function getPunchesForEmployeeAttendanceDay(employeeId, attendanceDateStr, excludeId = null) {
  return punchRecordsData.filter((p) => {
    if (p.employeeId !== employeeId || p.id === excludeId) return false;
    return getAttendanceDateForPunch(p) === attendanceDateStr;
  });
}

function validateProposedDay(employeeId, attendanceDateStr, excludeId, candidate) {
  if (candidate) {
    const cd = parsePunchDate(candidate);
    if (!cd) return { ok: false, message: "Invalid date/time." };
    const candDay = getAttendanceDateStrFromDate(cd);
    if (candDay !== attendanceDateStr) {
      return {
        ok: false,
        message: `That clock time falls in a different attendance day (${candDay}). Use Add punch with the correct date/time, or edit filters.`,
      };
    }
  }
  const base = getPunchesForEmployeeAttendanceDay(employeeId, attendanceDateStr, excludeId);
  const merged = candidate ? [...base, candidate] : base;
  const sorted = toSortedTimeline(merged);
  const v = validateAlternatingTimeline(sorted);
  if (!v.ok) return v;
  const totalMs = computeTotalMsInside(sorted, attendanceDateStr);
  if (totalMs > MAX_SHIFT_MS) {
    return {
      ok: false,
      message: `Total time in the building cannot exceed ${MAX_SHIFT_HOURS} hours for this attendance day (current total would be ${formatDuration(totalMs)}).`,
    };
  }
  return { ok: true, message: "", sorted };
}

export async function loadPunchRecords(db) {
  punchRecordsDb = db;
  const listEl = document.getElementById("punch-records-list");
  const filterEmployeeEl = document.getElementById("punch-records-filter-employee");
  const filterDateFromEl = document.getElementById("punch-records-filter-date-from");
  const filterDateToEl = document.getElementById("punch-records-filter-date-to");

  if (!listEl) return;

  listEl.innerHTML = "<p style='padding:2rem;text-align:center;color:#64748b;'>Loading punch records…</p>";

  try {
    const snap = await getDocs(collection(db, "punchRecords"));
    punchRecordsData = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      _timestamp: d.data().timestamp,
    }));

    punchRecordsData.sort((a, b) => {
      const ta = parsePunchDate(a)?.getTime() ?? 0;
      const tb = parsePunchDate(b)?.getTime() ?? 0;
      return tb - ta;
    });

    const employeesSnap = await getDocs(collection(db, "employees"));
    cachedEmployees = employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cachedEmployees.sort((a, b) =>
      (a.fullName || a.name || a.id || "").localeCompare(b.fullName || b.name || b.id || "")
    );

    if (filterEmployeeEl) {
      const empIds = [...new Set(punchRecordsData.map((p) => p.employeeId).filter(Boolean))];
      const currentVal = filterEmployeeEl.value;
      filterEmployeeEl.innerHTML =
        "<option value=''>All employees</option>" +
        empIds
          .map((eid) => {
            const emp = cachedEmployees.find((e) => e.id === eid);
            const name = emp ? emp.fullName || emp.name || emp.id : eid;
            return `<option value="${escapeHtml(eid)}">${escapeHtml(name)}</option>`;
          })
          .join("");
      if (currentVal && empIds.includes(currentVal)) filterEmployeeEl.value = currentVal;
    }

    const addEmpEl = document.getElementById("punch-add-employee");
    if (addEmpEl) {
      const curAdd = addEmpEl.value;
      addEmpEl.innerHTML =
        "<option value=''>Select…</option>" +
        cachedEmployees
          .map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.fullName || e.name || e.id)}</option>`)
          .join("");
      if (curAdd && cachedEmployees.some((e) => e.id === curAdd)) addEmpEl.value = curAdd;
    }

    const addDateEl = document.getElementById("punch-add-date");
    if (addDateEl && !addDateEl.value) addDateEl.value = todayStr();

    if (filterDateFromEl && !filterDateFromEl.value) {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      filterDateFromEl.value = d.toISOString().slice(0, 10);
    }
    if (filterDateToEl && !filterDateToEl.value) {
      filterDateToEl.value = new Date().toISOString().slice(0, 10);
    }

    const resetEmployeeEl = document.getElementById("punch-reset-employee");
    const resetDateEl = document.getElementById("punch-reset-date");
    if (resetEmployeeEl && cachedEmployees.length) {
      resetEmployeeEl.innerHTML =
        "<option value=''>All employees</option>" +
        cachedEmployees
          .map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.fullName || e.name || e.id)}</option>`)
          .join("");
    }
    if (resetDateEl && !resetDateEl.value) {
      resetDateEl.value = new Date().toISOString().slice(0, 10);
    }

    bindAdminPunchFormsOnce();
    renderPunchRecords();
  } catch (err) {
    console.error("loadPunchRecords failed:", err);
    listEl.innerHTML =
      "<p style='padding:2rem;text-align:center;color:#ef4444;'>Failed to load: " + escapeHtml(err.message || err) + "</p>";
  }
}

function bindAdminPunchFormsOnce() {
  const isAdmin = !!document.getElementById("punch-reset-section");
  if (!isAdmin || !punchRecordsDb) return;

  const form = document.getElementById("punch-add-form");
  if (form && !form.dataset.bound) {
    form.dataset.bound = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const empId = document.getElementById("punch-add-employee")?.value?.trim();
      const dateStr = document.getElementById("punch-add-date")?.value?.trim();
      const timeStr = document.getElementById("punch-add-time")?.value?.trim();
      const type = document.getElementById("punch-add-type")?.value || "in";
      if (!empId || !dateStr || !timeStr) {
        alert("Please select employee, date, and time.");
        return;
      }
      const emp = cachedEmployees.find((x) => x.id === empId);
      const employeeName = emp ? emp.fullName || emp.name || empId : empId;
      const when = combineDateTimeLocal(dateStr, timeStr);
      const attendanceDateStr = getAttendanceDateStrFromDate(when);
      const candidate = {
        id: "__new__",
        employeeId: empId,
        employeeName,
        date: attendanceDateStr,
        type,
        timestamp: Timestamp.fromDate(when),
        _timestamp: Timestamp.fromDate(when),
      };
      const check = validateProposedDay(empId, attendanceDateStr, null, candidate);
      if (!check.ok) {
        alert(check.message);
        return;
      }
      const btn = document.getElementById("punch-add-submit");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Saving…";
      }
      try {
        await addDoc(collection(punchRecordsDb, "punchRecords"), {
          employeeId: empId,
          employeeName,
          date: attendanceDateStr,
          type,
          timestamp: Timestamp.fromDate(when),
        });
        if (onDeleteSuccessFn) onDeleteSuccessFn("Punch added.");
        await loadPunchRecords(punchRecordsDb);
      } catch (err) {
        console.error(err);
        alert("Failed to add punch: " + (err.message || err));
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Add punch";
        }
      }
    });
  }

  const saveBtn = document.getElementById("punch-edit-save");
  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.dataset.bound = "1";
    saveBtn.addEventListener("click", async () => {
      const id = document.getElementById("punch-edit-id")?.value?.trim();
      const calDate = document.getElementById("punch-edit-date")?.value?.trim();
      const timeStr = document.getElementById("punch-edit-time")?.value?.trim();
      const type = document.getElementById("punch-edit-type")?.value || "in";
      const empId = saveBtn.dataset.editEmployeeId;
      if (!id || !calDate || !empId || !timeStr) return;

      const existing = punchRecordsData.find((p) => p.id === id);
      if (!existing) {
        alert("Punch not found. Refresh and try again.");
        return;
      }
      const emp = cachedEmployees.find((x) => x.id === empId);
      const employeeName = existing.employeeName || (emp ? emp.fullName || emp.name : empId);
      const when = combineDateTimeLocal(calDate, timeStr);
      const attendanceDateStr = getAttendanceDateStrFromDate(when);
      const candidate = {
        id,
        employeeId: empId,
        employeeName,
        date: attendanceDateStr,
        type,
        timestamp: Timestamp.fromDate(when),
        _timestamp: Timestamp.fromDate(when),
      };
      const check = validateProposedDay(empId, attendanceDateStr, id, candidate);
      if (!check.ok) {
        alert(check.message);
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      try {
        await updateDoc(doc(punchRecordsDb, "punchRecords", id), {
          type,
          date: attendanceDateStr,
          timestamp: Timestamp.fromDate(when),
          employeeName,
        });
        closePunchEditModal();
        if (onDeleteSuccessFn) onDeleteSuccessFn("Punch updated.");
        await loadPunchRecords(punchRecordsDb);
      } catch (err) {
        console.error(err);
        alert("Failed to update: " + (err.message || err));
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
    });
  }

  const closeBtn = document.getElementById("punch-edit-modal-close");
  const cancelBtn = document.getElementById("punch-edit-cancel");
  const modal = document.getElementById("punch-edit-modal");
  [closeBtn, cancelBtn].forEach((b) => {
    if (b && !b.dataset.punchCloseBound) {
      b.dataset.punchCloseBound = "1";
      b.addEventListener("click", closePunchEditModal);
    }
  });
  if (modal && !modal.dataset.overlayBound) {
    modal.dataset.overlayBound = "1";
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closePunchEditModal();
    });
  }
}

function closePunchEditModal() {
  const modal = document.getElementById("punch-edit-modal");
  if (modal) modal.style.display = "none";
}

function openPunchEditModal(punch) {
  const modal = document.getElementById("punch-edit-modal");
  const hint = document.getElementById("punch-edit-hint");
  const idInp = document.getElementById("punch-edit-id");
  const dateInp = document.getElementById("punch-edit-date");
  const timeInp = document.getElementById("punch-edit-time");
  const typeInp = document.getElementById("punch-edit-type");
  const saveBtn = document.getElementById("punch-edit-save");
  if (!modal || !idInp || !dateInp || !timeInp || !typeInp || !saveBtn) return;

  const d = parsePunchDate(punch);
  const att = getAttendanceDateForPunch(punch);
  idInp.value = punch.id;
  dateInp.value = ymdLocal(d);
  timeInp.value = timeInputFromDate(d);
  typeInp.value = String(p.type || "in").toLowerCase() === "out" ? "out" : "in";
  saveBtn.dataset.editEmployeeId = punch.employeeId || "";
  if (hint) {
    hint.textContent = `${punch.employeeName || punch.employeeId || "Employee"} — attendance day: ${att} (${cutoverHintText()} cutover). In/Out must alternate within that 24h window.`;
  }
  modal.style.display = "flex";
}

export function renderPunchRecords() {
  const listEl = document.getElementById("punch-records-list");
  const filterEmployeeEl = document.getElementById("punch-records-filter-employee");
  const filterDateFromEl = document.getElementById("punch-records-filter-date-from");
  const filterDateToEl = document.getElementById("punch-records-filter-date-to");

  if (!listEl) return;

  let items = [...punchRecordsData];

  const empFilter = filterEmployeeEl?.value?.trim() || "";
  if (empFilter) items = items.filter((p) => p.employeeId === empFilter);

  const dateFrom = filterDateFromEl?.value?.trim() || "";
  const dateTo = filterDateToEl?.value?.trim() || "";
  if (dateFrom) items = items.filter((p) => getAttendanceDateForPunch(p) >= dateFrom);
  if (dateTo) items = items.filter((p) => getAttendanceDateForPunch(p) <= dateTo);

  const isAdmin = !!document.getElementById("punch-reset-section");

  if (items.length === 0) {
    listEl.innerHTML = "<p style='padding:2rem;text-align:center;color:#64748b;'>No punch records in this range.</p>";
    return;
  }

  const groups = new Map();
  for (const p of items) {
    const ad = getAttendanceDateForPunch(p);
    if (!ad) continue;
    const key = `${p.employeeId}|${ad}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const summaryRows = [];
  for (const [, punches] of groups) {
    const dateStr = getAttendanceDateForPunch(punches[0]) || punches[0].date || "";
    const empId = punches[0].employeeId;
    const sorted = toSortedTimeline(punches);
    const v = validateAlternatingTimeline(sorted);
    const firstIn = sorted.find((x) => x.type === "in");
    const lastOut = [...sorted].reverse().find((x) => x.type === "out");
    const totalMs = v.ok ? computeTotalMsInside(sorted, dateStr) : 0; // dateStr = attendance day label
    let totalStr = v.ok ? formatDuration(totalMs) : "Invalid sequence";
    if (v.ok && totalMs > MAX_SHIFT_MS) {
      totalStr = `${formatDuration(totalMs)} ⚠️ over ${MAX_SHIFT_HOURS}h cap`;
    }
    const name = punches[0].employeeName || empId || "—";
    const dept = getEmployeeDept(empId);
    summaryRows.push({
      key: `${empId}|${dateStr}`,
      empId,
      dateStr,
      name,
      dept,
      firstInTime: firstIn ? formatPunchTime(firstIn.raw._timestamp || firstIn.raw.timestamp) : "—",
      lastOutTime: lastOut ? formatPunchTime(lastOut.raw._timestamp || lastOut.raw.timestamp) : "—",
      totalStr,
      punches: sorted.map((x) => x.raw),
      valid: v.ok,
    });
  }

  summaryRows.sort((a, b) => {
    if (a.dateStr !== b.dateStr) return b.dateStr.localeCompare(a.dateStr);
    return a.name.localeCompare(b.name);
  });

  listEl.innerHTML = `

    <table class="admin-table manager-table" style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Attendance day</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Employee ID</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Name</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Department</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">First In</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Last Out</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Total in building</th>
          ${isAdmin ? "<th style='padding:0.6rem 0.8rem;text-align:center;'>Details</th>" : ""}
        </tr>
      </thead>
      <tbody>
        ${summaryRows
          .map((row) => {
            return `
          <tr class="punch-summary-row" style="border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(15,23,42,0.4);">
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(row.dateStr)}</td>
            <td style="padding:0.6rem 0.8rem;font-family:monospace;font-size:0.85rem;">${escapeHtml(row.empId)}</td>
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(row.name)}</td>
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(row.dept)}</td>
            <td style="padding:0.6rem 0.8rem;color:#10b981;">${escapeHtml(row.firstInTime)}</td>
            <td style="padding:0.6rem 0.8rem;color:#f87171;">${escapeHtml(row.lastOutTime)}</td>
            <td style="padding:0.6rem 0.8rem;font-weight:600;color:#fbbf24;">${escapeHtml(row.totalStr)}</td>
            ${
              isAdmin
                ? `<td style="padding:0.6rem 0.8rem;text-align:center;">
              <button type="button" class="btn btn-sm btn-outline punch-toggle-detail" style="font-size:0.75rem;">Show punches</button>
            </td>`
                : ""
            }
          </tr>
          ${
            isAdmin
              ? `
          <tr class="punch-detail-row" style="display:none;background:rgba(0,0,0,0.25);">
            <td colspan="8" style="padding:0.75rem 1rem;">
              <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:0.5rem;">Punches in this 24h window (chronological)</div>
              <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                <thead>
                  <tr style="color:#94a3b8;text-align:left;">
                    <th style="padding:0.35rem 0.5rem;">Time</th>
                    <th style="padding:0.35rem 0.5rem;">Type</th>
                    <th style="padding:0.35rem 0.5rem;text-align:right;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${row.punches
                    .map((p) => {
                      const ts = p._timestamp || p.timestamp;
                      const isIn = String(p.type || "in").toLowerCase() !== "out";
                      return `
                    <tr>
                      <td style="padding:0.35rem 0.5rem;">${escapeHtml(formatPunchTime(ts))}</td>
                      <td style="padding:0.35rem 0.5rem;color:${isIn ? "#10b981" : "#f87171"};font-weight:600;">${isIn ? "In" : "Out"}</td>
                      <td style="padding:0.35rem 0.5rem;text-align:right;white-space:nowrap;">
                        <button type="button" class="btn btn-sm btn-outline punch-edit-btn" data-id="${escapeHtml(p.id)}" style="font-size:0.72rem;margin-right:4px; width:auto;">Edit</button>
                        <button type="button" class="btn btn-sm punch-delete-btn" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(row.name)}" data-date="${escapeHtml(row.dateStr)}" data-time="${escapeHtml(formatPunchTime(ts))}" style="font-size:0.72rem;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.4); width:auto;">Delete</button>
                      </td>
                    </tr>`;
                    })
                    .join("")}
                </tbody>
              </table>
            </td>
          </tr>`
              : ""
          }
        `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  if (isAdmin && punchRecordsDb) {
    if (!punchListClickBound) {
      punchListClickBound = true;
      listEl.addEventListener("click", async (e) => {
        const t = e.target;
        const toggle = t.closest?.(".punch-toggle-detail");
        if (toggle) {
          const row = toggle.closest("tr");
          const detail = row?.nextElementSibling;
          if (detail?.classList?.contains("punch-detail-row")) {
            const show = detail.style.display === "none" || detail.style.display === "";
            detail.style.display = show ? "table-row" : "none";
            toggle.textContent = show ? "Hide punches" : "Show punches";
          }
          return;
        }

        const editBtn = t.closest?.(".punch-edit-btn");
        if (editBtn) {
          const id = editBtn.dataset.id;
          const p = punchRecordsData.find((x) => x.id === id);
          if (p) openPunchEditModal(p);
          return;
        }

        const delBtn = t.closest?.(".punch-delete-btn");
        if (delBtn) {
          const id = delBtn.dataset.id;
          const name = delBtn.dataset.name;
          const date = delBtn.dataset.date;
          const time = delBtn.dataset.time;
          if (!id) return;
          if (!confirm(`Delete punch for ${name} on ${date} at ${time}?`)) return;
          delBtn.disabled = true;
          try {
            await deleteDoc(doc(punchRecordsDb, "punchRecords", id));
            punchRecordsData = punchRecordsData.filter((x) => x.id !== id);
            if (onDeleteSuccessFn) onDeleteSuccessFn("Punch record deleted.");
            renderPunchRecords();
          } catch (err) {
            console.error(err);
            alert("Failed to delete: " + (err.message || err));
          } finally {
            delBtn.disabled = false;
          }
        }
      });
    }
  }
}

export async function resetPunchRecords(db, dateStr, employeeId, onSuccess) {
  if (!dateStr) throw new Error("Please select a date.");
  const toDelete = punchRecordsData.filter((p) => {
    const ad = getAttendanceDateForPunch(p);
    const legacy = !parsePunchDate(p) && (p.date || "") === dateStr;
    if (ad !== dateStr && !legacy) return false;
    if (employeeId && p.employeeId !== employeeId) return false;
    return true;
  });
  for (const p of toDelete) {
    await deleteDoc(doc(db, "punchRecords", p.id));
  }
  punchRecordsData = punchRecordsData.filter((p) => !toDelete.includes(p));
  if (onSuccess) onSuccess(toDelete.length);
}
