// punchrecords.js — View punch records (Manager & Admin), Admin reset & delete
import { collection, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

let punchRecordsData = [];
let punchRecordsDb = null;
let onDeleteSuccessFn = null;

export function setPunchDeleteSuccessCallback(fn) {
  onDeleteSuccessFn = fn;
}

function escapeHtml(str) {
  if (!str) return "—";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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
      const ta = a._timestamp?.toDate ? a._timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
      const tb = b._timestamp?.toDate ? b._timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
      return tb - ta;
    });

    const employeesSnap = await getDocs(collection(db, "employees"));
    const employees = employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (filterEmployeeEl) {
      const empIds = [...new Set(punchRecordsData.map((p) => p.employeeId).filter(Boolean))];
      const currentVal = filterEmployeeEl.value;
      filterEmployeeEl.innerHTML =
        "<option value=''>All employees</option>" +
        empIds
          .map((eid) => {
            const emp = employees.find((e) => e.id === eid);
            const name = emp ? emp.fullName || emp.name || emp.id : eid;
            return `<option value="${escapeHtml(eid)}">${escapeHtml(name)}</option>`;
          })
          .join("");
      if (currentVal && empIds.includes(currentVal)) filterEmployeeEl.value = currentVal;
    }

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
    if (resetEmployeeEl && employees.length) {
      employees.sort((a, b) => (a.fullName || a.name || a.id || "").localeCompare(b.fullName || b.name || b.id || ""));
      resetEmployeeEl.innerHTML =
        "<option value=''>All employees</option>" +
        employees
          .map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.fullName || e.name || e.id)}</option>`)
          .join("");
    }
    if (resetDateEl && !resetDateEl.value) {
      resetDateEl.value = new Date().toISOString().slice(0, 10);
    }

    renderPunchRecords();
  } catch (err) {
    console.error("loadPunchRecords failed:", err);
    listEl.innerHTML =
      "<p style='padding:2rem;text-align:center;color:#ef4444;'>Failed to load: " + escapeHtml(err.message || err) + "</p>";
  }
}

export function renderPunchRecords() {
  const listEl = document.getElementById("punch-records-list");
  const filterEmployeeEl = document.getElementById("punch-records-filter-employee");
  const filterDateFromEl = document.getElementById("punch-records-filter-date-from");
  const filterDateToEl = document.getElementById("punch-records-filter-date-to");

  if (!listEl) return;

  let items = punchRecordsData;

  const empFilter = filterEmployeeEl?.value?.trim() || "";
  if (empFilter) items = items.filter((p) => p.employeeId === empFilter);

  const dateFrom = filterDateFromEl?.value?.trim() || "";
  const dateTo = filterDateToEl?.value?.trim() || "";
  if (dateFrom) items = items.filter((p) => (p.date || "") >= dateFrom);
  if (dateTo) items = items.filter((p) => (p.date || "") <= dateTo);

  if (items.length === 0) {
    listEl.innerHTML = "<p style='padding:2rem;text-align:center;color:#64748b;'>No punch records found.</p>";
    return;
  }

  const isAdmin = !!document.getElementById("punch-reset-section");

  listEl.innerHTML = `
    <table class="admin-table manager-table" style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Date</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Time</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Employee</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Type</th>
          ${isAdmin ? "<th style='padding:0.6rem 0.8rem;text-align:center;'>Delete</th>" : ""}
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (p) => {
              const ts = p._timestamp || p.timestamp;
              const isIn = (p.type || "in").toLowerCase() === "in";
              const typeLabel = isIn ? "In" : "Out";
              const rowBg = isIn ? "rgba(10, 209, 53, 0.18)" : "rgba(235, 66, 14, 0.18)";
              return `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.06);background:${rowBg};" data-punch-id="${escapeHtml(p.id)}">
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(p.date || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">${formatPunchTime(ts)}</td>
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(p.employeeName || p.employeeId || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">
              <span style="color:${isIn ? "#10b981" : "#ef4444"};font-weight:600;">${typeLabel}</span>
            </td>
            ${isAdmin ? `<td style="padding:0.6rem 0.8rem;text-align:center;"><button type="button" class="btn-punch-delete btn btn-sm" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.employeeName || p.employeeId || "—")}" data-date="${escapeHtml(p.date || "")}" data-time="${escapeHtml(formatPunchTime(ts))}" style="padding:0.25rem 0.5rem;font-size:0.75rem;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:6px;cursor:pointer;">Delete</button></td>` : ""}
          </tr>
        `;
            }
          )
          .join("")}
      </tbody>
    </table>
  `;

  if (isAdmin && punchRecordsDb) {
    listEl.querySelectorAll(".btn-punch-delete").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const date = btn.dataset.date;
        const time = btn.dataset.time;
        if (!id) return;
        if (!confirm(`Delete punch record for ${name} on ${date} at ${time}?`)) return;
        btn.disabled = true;
        btn.textContent = "…";
        try {
          await deleteDoc(doc(punchRecordsDb, "punchRecords", id));
          punchRecordsData = punchRecordsData.filter((p) => p.id !== id);
          if (onDeleteSuccessFn) onDeleteSuccessFn("Punch record deleted.");
          renderPunchRecords();
        } catch (err) {
          console.error("Delete punch failed:", err);
          alert("Failed to delete: " + (err.message || err));
        } finally {
          btn.disabled = false;
          btn.textContent = "Delete";
        }
      });
    });
  }
}

export async function resetPunchRecords(db, dateStr, employeeId, onSuccess) {
  if (!dateStr) throw new Error("Please select a date.");
  const toDelete = punchRecordsData.filter((p) => {
    if ((p.date || "") !== dateStr) return false;
    if (employeeId && p.employeeId !== employeeId) return false;
    return true;
  });
  for (const p of toDelete) {
    await deleteDoc(doc(db, "punchRecords", p.id));
  }
  punchRecordsData = punchRecordsData.filter((p) => !toDelete.includes(p));
  if (onSuccess) onSuccess(toDelete.length);
}
