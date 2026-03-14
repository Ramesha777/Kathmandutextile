// performance.js – Employee Performance Dashboard
// Charts, rankings, and stats based on wage entries created by managers

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

/* ───────── Helpers ───────── */
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}
function fmt(n) { return Math.round(n).toLocaleString(); }
function q(id) { return document.getElementById(id); }

/* ───────── State ───────── */
let empMap   = {};
let rawWages = [];
let charts   = {};
let lastAgg  = null;

/* ───────── 1. Load data from Firestore ───────── */
async function loadData() {
  // Load employees
  const empSnap = await getDocs(collection(db, "employees"));
  empMap = {};
  empSnap.forEach(d => {
    const data = d.data();
    empMap[d.id] = {
      id: d.id,
      fullName: data.fullName || data.name || data.email || d.id,
      department: data.department || "",
      ...data
    };
  });

  // Load wage entries
  const wageSnap = await getDocs(collection(db, "wageEntries"));
  rawWages = [];
  wageSnap.forEach(d => {
    rawWages.push({ id: d.id, ...d.data() });
  });

  console.log(`📊 Loaded ${Object.keys(empMap).length} employees, ${rawWages.length} wage entries`);
}

/* ───────── 2. Populate employee filter dropdown ───────── */
function populateFilters() {
  const empSel = q("f-emp");
  if (!empSel) return;

  // Get unique employee IDs from wage entries
  const empIds = [...new Set(rawWages.map(w => w.employeeId).filter(Boolean))];
  empSel.innerHTML = '<option value="all">All Employees</option>';

  empIds
    .map(id => ({
      id,
      name: empMap[id]?.fullName || empMap[id]?.name || id
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(e => {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = e.name;
      empSel.appendChild(opt);
    });

  // Set default date range (last 90 days)
  const today = new Date();
  const prev  = new Date();
  prev.setDate(today.getDate() - 90);

  const toEl   = q("f-date-to");
  const fromEl = q("f-date-from");
  if (toEl && !toEl.value)     toEl.value   = today.toISOString().slice(0, 10);
  if (fromEl && !fromEl.value) fromEl.value  = prev.toISOString().slice(0, 10);
}

/* ───────── 3. Filter wages based on current filter values ───────── */
function getFiltered() {
  const empId = q("f-emp")?.value  || "all";
  const dept  = q("f-dept")?.value || "all";
  const from  = q("f-date-from")?.value || "";
  const to    = q("f-date-to")?.value   || "";
  const prod  = (q("f-prod-search")?.value || "").toLowerCase().trim();

  return rawWages.filter(w => {
    // Employee filter
    if (empId !== "all" && w.employeeId !== empId) return false;

    // Department filter — check wage entry dept AND employee's dept
    if (dept !== "all") {
      const wDept = (w.department || "").toLowerCase();
      const eDept = (empMap[w.employeeId]?.department || "").toLowerCase();
      if (!wDept.includes(dept.toLowerCase()) && !eDept.includes(dept.toLowerCase())) return false;
    }

    // Date range filter
    if (from && w.date && w.date < from) return false;
    if (to && w.date && w.date > to) return false;

    // Product/item search filter
    if (prod) {
      const item = (w.item || w.productName || w.fibreName || w.label || "").toLowerCase();
      const eName = (empMap[w.employeeId]?.fullName || "").toLowerCase();
      if (!item.includes(prod) && !eName.includes(prod)) return false;
    }

    return true;
  });
}

/* ───────── 4. Aggregate filtered data ───────── */
function aggregate(wages) {
  const byEmp   = {};
  const byDept  = {};
  const byDeptWages = {};
  const byProd  = {};
  const byMonth = {};

  let totalQty   = 0;
  let totalWages = 0;
  let activeEmps = 0;

  for (const w of wages) {
    const eid   = w.employeeId || "unknown";
    const eName = empMap[eid]?.fullName || empMap[eid]?.name || w.employeeName || eid;
    const eDept = w.department || empMap[eid]?.department || "Other";
    const item  = w.item || w.productName || w.fibreName || w.label || "Unknown";
    const qty   = Number(w.qty || w.quantity || w.meters || w.pieces || w.hours || 0);
    const net   = Number(w.net || w.totalWage || w.wage || w.amount || 0);
    const date  = w.date || "";

    totalQty  += qty;
    totalWages += net;

    // Per employee
    if (!byEmp[eid]) {
      byEmp[eid] = { id: eid, name: eName, dept: eDept, qty: 0, net: 0, items: {}, months: new Set() };
      activeEmps++;
    }
    byEmp[eid].qty += qty;
    byEmp[eid].net += net;
    byEmp[eid].items[item] = (byEmp[eid].items[item] || 0) + qty;
    if (date) byEmp[eid].months.add(date.slice(0, 7));

    // Per department
    byDept[eDept]      = (byDept[eDept] || 0) + qty;
    byDeptWages[eDept] = (byDeptWages[eDept] || 0) + net;

    // Per product/item
    byProd[item] = (byProd[item] || 0) + qty;

    // Monthly trend (YYYY-MM key for proper sorting)
    if (date) {
      const mk = date.slice(0, 7);
      if (!byMonth[mk]) byMonth[mk] = { qty: 0, net: 0 };
      byMonth[mk].qty += qty;
      byMonth[mk].net += net;
    }
  }

  // Sort employees by qty desc
  const empList = Object.values(byEmp)
    .map(e => ({
      ...e,
      topItems: Object.entries(e.items)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, v]) => `${k} (${fmt(v)})`),
      monthCount: e.months.size
    }))
    .sort((a, b) => b.qty - a.qty);

  const monthKeys = Object.keys(byMonth).sort();

  // Per-employee monthly data for trend chart (top 6)
  const topEmpsForTrend = empList.slice(0, 6);

  return {
    totalQty,
    totalWages,
    activeCount: activeEmps,
    empList,
    byDept,
    byDeptWages,
    byProd,
    byMonth,
    monthKeys,
    topEmpsForTrend
  };
}

/* ───────── 5. Update stat cards ───────── */
function updateStats(agg) {
  const el = (id, v) => { const e = q(id); if (e) e.textContent = v; };
  el("stat-total-output", fmt(agg.totalQty));
  el("stat-total-wages",  "Rs. " + fmt(agg.totalWages));
  el("stat-active-count", agg.activeCount);
  el("stat-avg-output",   agg.activeCount ? fmt(agg.totalQty / agg.activeCount) : "0");

  // Top badge
  const leader = agg.empList[0];
  const badgeName  = q("top-badge-name");
  const badgeCount = q("top-badge-count");
  if (badgeName)  badgeName.textContent  = leader ? leader.name : "—";
  if (badgeCount) badgeCount.textContent = leader ? fmt(leader.qty) : "—";
}

/* ───────── 6. Chart colors & helpers ───────── */
const COLORS = [
  "#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899",
  "#06b6d4","#84cc16","#f97316","#ef4444","#14b8a6",
  "#6366f1","#d946ef","#0ea5e9","#22c55e","#eab308"
];
const DEPT_COLORS = { "Machine": "#38bdf8", "Production": "#f59e0b", "Daily": "#10b981" };

function rgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function destroyChart(key) {
  if (charts[key]) {
    try { charts[key].destroy(); } catch(e) {}
    delete charts[key];
  }
}

function monthLabel(yyyymm) {
  const [y, m] = yyyymm.split("-");
  if (!y || !m) return yyyymm;
  return new Date(+y, +m - 1).toLocaleString("default", { month: "short", year: "2-digit" });
}

/* ───────── 7. Render all charts ───────── */
function renderCharts(agg) {
  // Destroy all existing charts first
  Object.keys(charts).forEach(destroyChart);

  /* ── A. Top Employees Horizontal Bar (by qty) ── */
  const topCtx = q("topBar");
  if (topCtx && agg.empList.length) {
    const top = agg.empList.slice(0, 10);
    charts.topBar = new Chart(topCtx, {
      type: "bar",
      data: {
        labels: top.map(e => e.name),
        datasets: [{
          label: "Total Output (qty)",
          data: top.map(e => Math.round(e.qty)),
          backgroundColor: top.map((e, i) => rgba(DEPT_COLORS[e.dept] || COLORS[i % COLORS.length], 0.75)),
          borderColor: top.map((e, i) => DEPT_COLORS[e.dept] || COLORS[i % COLORS.length]),
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.7
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Top Employees by Work Output (Qty)", font: { size: 14, weight: "bold" } },
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `Output: ${fmt(ctx.raw)} units`,
              afterLabel: ctx => `Wages: Rs ${fmt(top[ctx.dataIndex]?.net || 0)}`
            }
          }
        },
        scales: {
          x: { beginAtZero: true, ticks: { callback: v => fmt(v) }, grid: { color: "rgba(0,0,0,0.05)" } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  /* ── B. Department Doughnut ── */
  const pieCtx = q("deptPie");
  if (pieCtx && Object.keys(agg.byDept).length) {
    const labels = Object.keys(agg.byDept);
    const data   = Object.values(agg.byDept);
    const total  = data.reduce((s, v) => s + v, 0);

    charts.deptPie = new Chart(pieCtx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data: data.map(v => Math.round(v)),
          backgroundColor: labels.map(l => rgba(DEPT_COLORS[l] || "#94a3b8", 0.75)),
          borderColor: labels.map(l => DEPT_COLORS[l] || "#94a3b8"),
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        plugins: {
          title: { display: true, text: "Output Share by Department", font: { size: 14, weight: "bold" } },
          legend: { position: "bottom", labels: { padding: 12, usePointStyle: true } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const pct = total ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                return `${ctx.label}: ${fmt(ctx.raw)} units (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  /* ── C. Department Bar (Qty vs Wages dual axis) ── */
  const deptBarCtx = q("deptBar");
  if (deptBarCtx && Object.keys(agg.byDept).length) {
    const deptLabels = Object.keys(agg.byDept);
    charts.deptBar = new Chart(deptBarCtx, {
      type: "bar",
      data: {
        labels: deptLabels,
        datasets: [
          {
            label: "Total Qty",
            data: deptLabels.map(d => Math.round(agg.byDept[d] || 0)),
            backgroundColor: deptLabels.map(l => rgba(DEPT_COLORS[l] || "#94a3b8", 0.8)),
            borderColor: deptLabels.map(l => DEPT_COLORS[l] || "#94a3b8"),
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: "y"
          },
          {
            label: "Total Wages (Rs)",
            data: deptLabels.map(d => Math.round(agg.byDeptWages[d] || 0)),
            backgroundColor: deptLabels.map(l => rgba(DEPT_COLORS[l] || "#94a3b8", 0.3)),
            borderColor: deptLabels.map(l => DEPT_COLORS[l] || "#94a3b8"),
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: "y1"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          title: { display: true, text: "Department Output (Qty) vs Wages", font: { size: 14, weight: "bold" } },
          legend: { position: "top" },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } }
        },
        scales: {
          x: { grid: { display: false } },
          y:  { position: "left",  beginAtZero: true, title: { display: true, text: "Quantity" },  ticks: { callback: v => fmt(v) }, grid: { color: "rgba(0,0,0,0.05)" } },
          y1: { position: "right", beginAtZero: true, title: { display: true, text: "Wages (Rs)" }, ticks: { callback: v => fmt(v) }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  /* ── D. Product/Item Bar (stacked by employee) ── */
  const prodCtx = q("prodBar");
  if (prodCtx && Object.keys(agg.byProd).length) {
    const topItems = Object.entries(agg.byProd)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([name]) => name);

    const topEmps = agg.empList.slice(0, 6);

    charts.prodBar = new Chart(prodCtx, {
      type: "bar",
      data: {
        labels: topItems,
        datasets: topEmps.map((emp, idx) => ({
          label: emp.name,
          data: topItems.map(item => Math.round(emp.items[item] || 0)),
          backgroundColor: rgba(COLORS[idx % COLORS.length], 0.7),
          borderColor: COLORS[idx % COLORS.length],
          borderWidth: 1,
          borderRadius: 4
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          title: { display: true, text: "Top Products/Items — Employee Breakdown (by Qty)", font: { size: 14, weight: "bold" } },
          legend: { position: "top", labels: { usePointStyle: true, padding: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)} units` } }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 40, font: { size: 10 } } },
          y: { stacked: true, beginAtZero: true, ticks: { callback: v => fmt(v) }, grid: { color: "rgba(0,0,0,0.05)" }, title: { display: true, text: "Quantity" } }
        }
      }
    });
  }

  /* ── E. Monthly Trend Line (per employee) ── */
  const trendCtx = q("trendLine");
  if (trendCtx && agg.monthKeys.length) {
    const topEmps = agg.topEmpsForTrend;
    charts.trendLine = new Chart(trendCtx, {
      type: "line",
      data: {
        labels: agg.monthKeys.map(monthLabel),
        datasets: [
          // Total output line
          {
            label: "Total Output",
            data: agg.monthKeys.map(k => Math.round(agg.byMonth[k].qty)),
            borderColor: "#94a3b8",
            backgroundColor: "rgba(148,163,184,0.08)",
            borderWidth: 3,
            borderDash: [6, 3],
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: "#94a3b8",
            order: 10
          },
          // Per-employee lines
          ...topEmps.map((emp, idx) => ({
            label: emp.name,
            data: agg.monthKeys.map(mk => {
              // Find this employee's qty for this month
              const monthQty = rawWages
                .filter(w => w.employeeId === emp.id && w.date && w.date.slice(0, 7) === mk)
                .reduce((s, w) => s + Number(w.qty || w.quantity || 0), 0);
              return Math.round(monthQty);
            }),
            borderColor: COLORS[idx % COLORS.length],
            backgroundColor: rgba(COLORS[idx % COLORS.length], 0.05),
            pointBackgroundColor: COLORS[idx % COLORS.length],
            pointRadius: 3,
            pointHoverRadius: 6,
            borderWidth: 2,
            fill: false,
            tension: 0.4
          }))
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          title: { display: true, text: "Monthly Output Trend by Employee", font: { size: 14, weight: "bold" } },
          legend: { position: "top", labels: { usePointStyle: true, padding: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)} units` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, ticks: { callback: v => fmt(v) }, grid: { color: "rgba(0,0,0,0.05)" }, title: { display: true, text: "Quantity" } }
        }
      }
    });
  }
}

/* ───────── 8. Leaderboard ───────── */
function renderLeaderboard(empList) {
  const el = q("leaderboard");
  if (!el) return;

  if (!empList.length) {
    el.innerHTML = '<p style="padding:1.5rem;text-align:center;color:#94a3b8;">No employee data for selected filters.</p>';
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const maxQty = empList[0].qty || 1;

  let html = `<div class="lb-table">
    <div class="lb-hdr">
      <span>#</span><span>Employee</span><span>Department</span><span>Top Items</span><span>Total Qty</span><span>Total Wages</span>
    </div>`;

  empList.forEach((e, i) => {
    const pct = (e.qty / maxQty * 100).toFixed(1);
    const col = i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : i === 2 ? "#fb923c" : "#38bdf8";
    html += `<div class="lb-row ${i < 3 ? 'lb-top3' : ''}">
      <span class="lb-rank" style="color:${col}">${medals[i] || '#' + (i + 1)}</span>
      <span class="lb-name">${escapeHtml(e.name)}</span>
      <span class="lb-dept">${escapeHtml(e.dept)}</span>
      <span class="lb-items">${e.topItems.map(t => escapeHtml(t)).join(", ") || "—"}</span>
      <span class="lb-qty" style="color:${col}">${fmt(e.qty)}</span>
      <span class="lb-wage">Rs. ${fmt(e.net)}</span>
    </div>`;
  });

  html += `</div>`;
  el.innerHTML = html;
}

/* ───────── 9. Detail table ───────── */
function renderDetailTable(empList) {
  const tbody = q("detail-body");
  if (!tbody) return;

  if (!empList.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:1.5rem;">No data for selected filters.</td></tr>';
    return;
  }

  const rows = [];
  empList.forEach((emp, rank) => {
    Object.entries(emp.items)
      .sort(([, a], [, b]) => b - a)
      .forEach(([item, qty]) => {
        rows.push({ rank, name: emp.name, dept: emp.dept, item, qty, net: emp.net, totalQty: emp.qty, monthCount: emp.monthCount });
      });
  });

  rows.sort((a, b) => b.qty - a.qty);

  tbody.innerHTML = rows.slice(0, 50).map(r => {
    const ratePerUnit = r.totalQty > 0 ? (r.net / r.totalQty).toFixed(2) : "—";
    const deptCol = DEPT_COLORS[r.dept] || "#94a3b8";
    return `<tr class="${r.rank < 3 ? 'detail-top3' : ''}">
      <td><strong>${escapeHtml(r.name)}</strong></td>
      <td><span style="background:${rgba(deptCol, 0.12)};color:${deptCol};padding:2px 8px;border-radius:4px;font-size:0.8rem;">${escapeHtml(r.dept)}</span></td>
      <td>${escapeHtml(r.item)}</td>
      <td><strong style="color:#f59e0b">${fmt(r.qty)}</strong></td>
      <td>Rs. ${fmt(r.net)}</td>
      <td>${ratePerUnit}</td>
      <td>${r.monthCount || 1}</td>
    </tr>`;
  }).join("");
}

/* ───────── 10. CSV Export ───────── */
function exportCSV(empList) {
  if (!empList || !empList.length) return alert("No data to export.");

  let csv = "Rank,Employee,Department,Total Qty,Total Wages,Rate/Unit,Months Active,Top Items\n";
  empList.forEach((e, i) => {
    const items = e.topItems.join("; ").replace(/"/g, '""');
    const rate  = e.qty > 0 ? (e.net / e.qty).toFixed(2) : "0";
    csv += `${i + 1},"${e.name.replace(/"/g, '""')}","${e.dept.replace(/"/g, '""')}",${Math.round(e.qty)},${Math.round(e.net)},${rate},${e.monthCount || 1},"${items}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `performance_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ───────── 11. Master refresh ───────── */
function refresh() {
  const filtered = getFiltered();

  if (!filtered.length) {
    // Show empty state without destroying DOM
    const el = (id, v) => { const e = q(id); if (e) e.textContent = v; };
    el("stat-total-output", "0");
    el("stat-total-wages",  "Rs. 0");
    el("stat-active-count", "0");
    el("stat-avg-output",   "0");
    const bn = q("top-badge-name");  if (bn) bn.textContent = "—";
    const bc = q("top-badge-count"); if (bc) bc.textContent = "—";

    // Destroy charts
    Object.keys(charts).forEach(destroyChart);
    renderLeaderboard([]);
    renderDetailTable([]);
    return;
  }

  const agg = aggregate(filtered);
  lastAgg = agg;

  console.log(`📊 Filtered: ${filtered.length} entries → ${agg.activeCount} employees, ${fmt(agg.totalQty)} total qty, ${Object.keys(agg.byDept).length} depts`);

  updateStats(agg);
  renderCharts(agg);
  renderLeaderboard(agg.empList);
  renderDetailTable(agg.empList);
}

/* ───────── 12. Wire up filter listeners ───────── */
function setupFilters() {
  // Dropdown & date filters — refresh on change
  ["f-emp", "f-dept", "f-date-from", "f-date-to"].forEach(id => {
    const el = q(id);
    if (el) el.addEventListener("change", refresh);
  });

  // Product search — debounced refresh on input
  const prodEl = q("f-prod-search");
  if (prodEl) {
    let timer;
    prodEl.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 300);
    });
  }

  // Reset button — clear all filters & refresh
  const resetBtn = q("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const empSel  = q("f-emp");
      const deptSel = q("f-dept");
      const fromEl  = q("f-date-from");
      const toEl    = q("f-date-to");
      const prodEl  = q("f-prod-search");

      if (empSel)  empSel.value  = "all";
      if (deptSel) deptSel.value = "all";
      if (fromEl)  fromEl.value  = "";
      if (toEl)    toEl.value    = "";
      if (prodEl)  prodEl.value  = "";

      refresh();
    });
  }

  // Export CSV button
  const exportBtn = q("exportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      if (lastAgg && lastAgg.empList.length) {
        exportCSV(lastAgg.empList);
      } else {
        alert("No data to export. Try adjusting your filters.");
      }
    });
  }
}

/* ───────── 13. Init ───────── */
async function init() {
  try {
    // Show loading state
    document.querySelectorAll(".sc-value").forEach(el => el.textContent = "Loading…");

    await loadData();
    populateFilters();
    setupFilters();
    refresh();

    console.log("✅ Performance dashboard initialized");
  } catch (err) {
    console.error("💥 Performance init failed:", err);
    document.querySelectorAll(".sc-value").forEach(el => el.textContent = "Error");

    const lb = q("leaderboard");
    if (lb) lb.innerHTML = `<p style="padding:1.5rem;text-align:center;color:#ef4444;">Failed to load: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

// Run init when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

