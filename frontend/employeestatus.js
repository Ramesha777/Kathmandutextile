// employeestatus.js — Employee table with In/Out status (Manager & Admin)
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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

export async function loadEmployeeStatus(db) {
  const listEl = document.getElementById("employee-status-list");
  if (!listEl) return;

  listEl.innerHTML = "<p style='padding:2rem;text-align:center;color:#64748b;'>Loading employee status…</p>";

  try {
    const today = new Date().toISOString().slice(0, 10);
    const [employeesSnap, punchesSnap] = await Promise.all([
      getDocs(collection(db, "employees")),
      getDocs(collection(db, "punchRecords")),
    ]);

    const employees = employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const punches = punchesSnap.docs
      .map((d) => ({ id: d.id, ...d.data(), _ts: d.data().timestamp }))
      .filter((p) => (p.date || "").trim() === today);

    // For each employee, get their latest punch today
    const statusByEmp = {};
    punches.forEach((p) => {
      const eid = p.employeeId;
      if (!eid) return;
      const ts = p._ts?.toDate ? p._ts.toDate().getTime() : new Date(p.timestamp || 0).getTime();
      if (!statusByEmp[eid] || ts > (statusByEmp[eid].ts || 0)) {
        statusByEmp[eid] = { type: (p.type || "in").toLowerCase(), ts: p._ts };
      }
    });

    employees.sort((a, b) =>
      (a.fullName || a.name || a.id || "").localeCompare(b.fullName || b.name || b.id || "")
    );

    renderEmployeeStatus(listEl, employees, statusByEmp);
  } catch (err) {
    console.error("loadEmployeeStatus failed:", err);
    listEl.innerHTML =
      "<p style='padding:2rem;text-align:center;color:#ef4444;'>Failed to load: " + escapeHtml(err.message || err) + "</p>";
  }
}

function renderEmployeeStatus(listEl, employees, statusByEmp) {
  if (!employees.length) {
    listEl.innerHTML = "<p style='padding:2rem;text-align:center;color:#64748b;'>No employees found.</p>";
    return;
  }

  listEl.innerHTML = `
    <table class="admin-table manager-table" style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="padding:0.6rem 0.8rem;text-align:left;">ID</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Name</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Email</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Department</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Status</th>
          <th style="padding:0.6rem 0.8rem;text-align:left;">Last Punch</th>
        </tr>
      </thead>
      <tbody>
        ${employees
          .map((e) => {
            const st = statusByEmp[e.id];
            const isIn = st && st.type === "in";
            const rowBg = isIn
              ? "background:rgba(16,185,129,0.15);"
              : st && st.type === "out"
                ? "background:rgba(239,68,68,0.15);"
                : "background:rgba(100,116,139,0.1);";
            const statusText = isIn ? "In building" : st && st.type === "out" ? "Punched out" : "—";
            const lastPunch = st?.ts ? formatPunchTime(st.ts) : "—";
            return `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.06);${rowBg}">
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(e.id || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(e.fullName || e.name || e.id || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(e.email || "—")}</td>
            <td style="padding:0.6rem 0.8rem;">${escapeHtml(e.department || "—")}</td>
            <td style="padding:0.6rem 0.8rem;font-weight:600;color:${isIn ? "#10b981" : st && st.type === "out" ? "#ef4444" : "#64748b"}">${escapeHtml(statusText)}</td>
            <td style="padding:0.6rem 0.8rem;">${lastPunch}</td>
          </tr>
        `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}
