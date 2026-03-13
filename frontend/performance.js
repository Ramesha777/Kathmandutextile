import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Chart utils
function rgba(h, a){const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return`rgba(${r},${g},${b},${a})`}

const TT = {
  backgroundColor:"rgba(11,15,30,.96)", titleColor:"#f0f4ff", bodyColor:"#94a3b8",
  borderColor:"#f59e0b", borderWidth:1, padding:10, cornerRadius:8,
  titleFont:{family:"'DM Sans',sans-serif",weight:"600"},
  bodyFont:{family:"'DM Sans',sans-serif"},
};
const GRID="rgba(255,255,255,.06)", TM="#64748b", TS="#94a3b8", TP="#f0f4ff";
function titleCfg(t){return{display:true,text:t,color:TP,font:{family:"'Playfair Display',serif",size:14,weight:"600"},padding:{bottom:14}}}
function legCfg(pos="top"){return{position:pos,labels:{color:TS,font:{family:"'DM Sans',sans-serif",size:11},usePointStyle:true,pointStyleWidth:10,padding:12}}}

// Colors for depts/employees
const DEPT_COLORS = {
  "Machine": "#38bdf8",
  "Production": "#f59e0b", 
  "Daily": "#10b981"
};

// Global state
let rawWages = [];
let empMap = {};
let charts = {};

// Load base data once
async function loadBaseData() {
  try {
    // Load all wageEntries (client-side filter for perf)
    const wagesSnap = await getDocs(collection(db, 'wageEntries'));
    rawWages = wagesSnap.docs.map(d => ({id: d.id, ...d.data()}));

    // Load employees map
    const empSnap = await getDocs(collection(db, 'employees'));
    empMap = {};
    empSnap.docs.forEach(d => {
      const data = d.data();
      empMap[d.id] = data.fullName || data.name || data.email || d.id;
    });

    console.log(`Loaded ${rawWages.length} wage entries, ${Object.keys(empMap).length} employees`);
    return true;
  } catch (err) {
    console.error('Failed to load data:', err);
    showEmptyState('Failed to load wage data');
    return false;
  }
}

// Filter raw wages by UI filters
function getFilteredWages() {
  let filtered = [...rawWages];
  
  // Date range
  const from = document.getElementById('f-date-from')?.value;
  const to = document.getElementById('f-date-to')?.value;
  if (from) filtered = filtered.filter(w => w.date >= from);
  if (to) filtered = filtered.filter(w => w.date <= to);

  // Employee
  const empId = document.getElementById('f-emp')?.value;
  if (empId && empId !== 'all') filtered = filtered.filter(w => w.employeeId === empId);

  // Dept
  const dept = document.getElementById('f-dept')?.value;
  if (dept && dept !== 'all') filtered = filtered.filter(w => w.department === dept);

  // Product search (fuzzy)
  const prodSearch = document.getElementById('f-prod-search')?.value?.toLowerCase().trim();
  if (prodSearch) {
    filtered = filtered.filter(w => 
      (w.item || '').toLowerCase().includes(prodSearch)
    );
  }

  return filtered;
}

// Compute all aggregates from filtered wages
function computeAggregates(filtered) {
  const empTotals = {};
  const deptTotals = {};
  const itemTotals = {};
  const monthTotals = {};
  let totalQty = 0, totalNet = 0, activeEmps = 0;

  filtered.forEach(w => {
    const qty = Number(w.qty) || 0;
    const net = Number(w.net) || 0;
    const empId = w.employeeId;
    const empName = empMap[empId] || empId || 'Unknown';
    const dept = w.department || 'Unknown';
    const item = w.item || 'Misc';
    const date = new Date(w.date);
    const monthKey = date.toLocaleString('default', { month: 'short', year: 'numeric' });

    // Emp totals
    if (!empTotals[empId]) {
      empTotals[empId] = { name: empName, dept, qty: 0, net: 0, items: {}, months: {} };
      activeEmps++;
    }
    empTotals[empId].qty += qty;
    empTotals[empId].net += net;
    empTotals[empId].items[item] = (empTotals[empId].items[item] || 0) + qty;
    empTotals[empId].months[monthKey] = (empTotals[empId].months[monthKey] || 0) + qty;

    // Depts
    deptTotals[dept] = (deptTotals[dept] || 0) + qty;

    // Items (top for chart)
    itemTotals[item] = (itemTotals[item] || 0) + qty;

    // Months (for trend)
    monthTotals[monthKey] = (monthTotals[monthKey] || 0) + qty;

    totalQty += qty;
    totalNet += net;
  });

  // Sort emps by qty
  const sortedEmps = Object.values(empTotals).sort((a,b) => b.qty - a.qty);
  const topItems = Object.entries(itemTotals)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 5)
    .map(([name,qty]) => ({name, qty}));

  const months = Object.keys(monthTotals).sort().slice(-6); // Last 6 months
  const empTrendData = sortedEmps.slice(0,6).map(emp => 
    months.map(m => emp.months[m] || 0)
  );

  return {
    emps: sortedEmps,
    depts: deptTotals,
    topItems,
    months,
    empTrendData,
    stats: { totalQty, totalNet, activeEmps: Math.max(1, activeEmps), avgPerEmp: activeEmps ? totalQty / activeEmps : 0 }
  };
}

// Update stats cards
function updateStats(stats) {
  document.querySelector('.sc-value[style*="f59e0b"]').textContent = Math.round(stats.totalQty).toLocaleString();
  document.querySelectorAll('.sc-value[style*="10b981"]').forEach(el => el.textContent = `Rs ${stats.totalNet.toLocaleString()}`);
  document.querySelector('.sc-value[style*="38bdf8"]').textContent = stats.activeEmps;
  document.querySelector('.sc-value[style*="8b5cf6"]').textContent = Math.round(stats.avgPerEmp);
  
  // Top badge
  if (stats.emps.length) {
    const leader = stats.emps[0];
    document.getElementById('top-badge').innerHTML = `🏆 <strong style="color:#fbbf24">${leader.name}</strong> leads with <strong style="color:#fbbf24">${Math.round(leader.qty)}</strong> units`;
  }
}

// Charts (destroy first)
function updateCharts(aggs) {
  const ctxMap = {
    topBar: 'topBar',
    deptPie: 'deptPie', 
    prodBar: 'prodBar',
    trendLine: 'trendLine'
  };

  Object.entries(charts).forEach(([k,c]) => c?.destroy());
  charts = {};

  // Top bar: emps by qty (w/ pay tooltip)
  const topCtx = document.getElementById(ctxMap.topBar);
  if (topCtx && aggs.emps.length) {
    charts.topBar = new Chart(topCtx, {
      type: "bar",
      data: {
        labels: aggs.emps.slice(0,10).map(e => e.name),
        datasets: [{label:"Total Output", data: aggs.emps.slice(0,10).map(e => e.qty), 
          backgroundColor: aggs.emps.slice(0,10).map(e => rgba(DEPT_COLORS[e.dept] || '#64748b', 0.72)),
          borderColor: aggs.emps.slice(0,10).map(e => DEPT_COLORS[e.dept] || '#64748b'),
          borderWidth: 1, borderRadius: 6
        }]
      },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: {display: false}, title: titleCfg("Top Employee Output"),
          tooltip: {...TT, callbacks: {
            afterLabel: ctx => `Wages: Rs ${(aggs.emps[ctx.dataIndex]?.net || 0).toLocaleString()}`
          }}
        },
        scales: {
          x: {ticks:{color:TM,font:{size:11}},grid:{color:GRID},beginAtZero:true,title:{display:true,text:"Quantity",color:TM,font:{size:11}}},
          y: {ticks:{color:TS,font:{size:11}},grid:{color:"transparent"}}
        }
      }
    });
  }

  // Dept pie
  const pieCtx = document.getElementById(ctxMap.deptPie);
  if (pieCtx) {
    const labels = Object.keys(aggs.depts);
    const data = Object.values(aggs.depts);
    charts.deptPie = new Chart(pieCtx, {
      type: "doughnut",
      data: { labels, datasets: [{data, backgroundColor: labels.map(l => rgba(DEPT_COLORS[l] || '#94a3b8', 0.75)),
        borderColor: labels.map(l => DEPT_COLORS[l] || '#94a3b8'), borderWidth: 2 }] },
      options: {responsive: true, maintainAspectRatio: false, cutout: "62%",
        plugins: {legend: legCfg("right"), title: titleCfg("Output by Department"), tooltip: TT} }
    });
  }

  // Prod bar (top items)
  const prodCtx = document.getElementById(ctxMap.prodBar);
  if (prodCtx && aggs.topItems.length) {
    charts.prodBar = new Chart(prodCtx, {
      type: "bar",
      data: {
        labels: aggs.topItems.map(i => i.name),
        datasets: aggs.emps.slice(0,6).map((emp, idx) => ({
          label: emp.name,
          data: aggs.topItems.map(i => emp.items[i.name] || 0),
          backgroundColor: rgba(DEPT_COLORS[emp.dept] || '#94a3b8', 0.7),
          borderColor: DEPT_COLORS[emp.dept] || '#94a3b8'
        }))
      },
      options: {responsive: true, maintainAspectRatio: false, interaction: {mode:"index",intersect:false},
        plugins: {legend: legCfg("top"), title: titleCfg("Top Products by Employee"), tooltip: TT},
        scales: {x: {ticks:{color:TM,font:{size:11}},grid:{color:GRID}},
          y: {ticks:{color:TM,font:{size:11}},grid:{color:GRID},beginAtZero:true,title:{display:true,text:"Quantity",color:TM,font:{size:11}}}} }
    });
  }

  // Trend line
  const trendCtx = document.getElementById(ctxMap.trendLine);
  if (trendCtx && aggs.months.length) {
    charts.trendLine = new Chart(trendCtx, {
      type: "line",
      data: {
        labels: aggs.months,
        datasets: aggs.emps.slice(0,6).map((emp, idx) => ({
          label: emp.name,
          data: aggs.empTrendData[idx] || aggs.months.map(() => 0),
          borderColor: DEPT_COLORS[emp.dept] || '#94a3b8',
          backgroundColor: rgba(DEPT_COLORS[emp.dept] || '#94a3b8', 0.07),
          pointBackgroundColor: DEPT_COLORS[emp.dept] || '#94a3b8',
          pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5, fill: false, tension: 0.4
        }))
      },
      options: {responsive: true, maintainAspectRatio: false, interaction: {mode:"index",intersect:false},
        plugins: {legend: legCfg("top"), title: titleCfg("Monthly Output Trend"), tooltip: TT},
        scales: {x: {ticks:{color:TM,font:{size:11}},grid:{color:GRID}},
          y: {ticks:{color:TM,font:{size:11}},grid:{color:GRID},beginAtZero:true,title:{display:true,text:"Quantity",color:TM,font:{size:11}}}} }
    });
  }
}

// Leaderboard & table
function updateLeaderboardTable(aggs) {
  const lbEl = document.getElementById("leaderboard");
  const tbody = document.getElementById("detail-body");
  const medals = ["🥇","🥈","🥉"];

  // Leaderboard
  if (lbEl && aggs.emps.length) {
    const html = aggs.emps.slice(0,10).map((emp, i) => {
      const maxQty = aggs.emps[0].qty;
      const pct = maxQty ? (emp.qty / maxQty * 100).toFixed(1) : 0;
      const col = i===0 ? "#f59e0b" : i===1 ? "#94a3b8" : i===2 ? "#fb923c" : "#38bdf8";
      const topItems = Object.entries(emp.items).sort(([,a],[,b])=>b-a).slice(0,3).map(([n])=>n).join(", ");
      return `<div class="lb-row">
        <div class="lb-rank" style="color:${col}">${medals[i]||`#${i+1}`}</div>
        <div class="lb-info">
          <div class="lb-name">${emp.name}</div>
          <div class="lb-meta">${emp.dept} · ${topItems}</div>
          <div class="lb-bar-wrap"><div class="lb-bar" style="width:${pct}%;background:${col}"></div></div>
        </div>
        <div class="lb-right">
          <div class="lb-qty" style="color:${col}">${Math.round(emp.qty).toLocaleString()}</div>
          <div class="lb-pay">Rs ${Math.round(emp.net).toLocaleString()}</div>
        </div>
      </div>`;
    }).join("");
    lbEl.innerHTML = html;
  }

  // Detail table (top 50 rows)
  if (tbody && aggs.emps.length) {
    // Flatten emp-item rows
    const rows = [];
    aggs.emps.slice(0,20).forEach(emp => {
      Object.entries(emp.items).forEach(([item, qty]) => {
        rows.push({name: emp.name, dept: emp.dept, item, qty, rate: 0, months: Object.keys(emp.months).length });
      });
    });
    rows.sort((a,b) => b.qty - a.qty);
    tbody.innerHTML = rows.slice(0,50).map(r => 
      `<tr>
        <td>${r.name}</td>
        <td><span class="badge" style="background:${rgba(DEPT_COLORS[r.dept] || '#94a3b8', 0.12)};color:${DEPT_COLORS[r.dept] || '#94a3b8'}">${r.dept}</span></td>
        <td>${r.item}</td>
        <td><strong style="color:#fbbf24">${Math.round(r.qty).toLocaleString()}</strong></td>
        <td>—</td>
        <td>—</td>
        <td>${r.months}</td>
      </tr>`
    ).join("");
  }
}

// Show empty/error state
function showEmptyState(msg = 'No wage data yet') {
  document.querySelector('.stats').innerHTML = `<div style="grid-column:1/-1; padding:2rem; text-align:center; color:#94a3b8;">${msg}</div>`;
  ['topBar','deptPie','prodBar','trendLine'].forEach(id => {
    const ctx = document.getElementById(id);
    if (ctx) ctx.parentElement.innerHTML = `<div style="padding:2rem; text-align:center; color:#94a3b8;">No data</div>`;
  });
  document.getElementById("leaderboard")?.remove();
  document.getElementById("detail-body")?.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8;">No data</td></tr>';
}

// Main refresh
async function refreshAll() {
  const filteredWages = getFilteredWages();
  if (!filteredWages.length) {
    showEmptyState('No matching data for selected filters');
    return;
  }

  const aggs = computeAggregates(filteredWages);
  updateStats(aggs);
  updateCharts(aggs);
  updateLeaderboardTable(aggs);
}

// Filter listeners
function setupFilters() {
  const filters = ['f-emp','f-dept','f-prod-search','f-date-from','f-date-to'];
  filters.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', refreshAll);
  });
  // Product search input
  const prodEl = document.getElementById('f-prod-search');
  if (prodEl) prodEl.addEventListener('input', refreshAll);

  // Reset btn
  const resetBtn = document.querySelector('.rbtn');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    ['f-emp','f-dept','f-prod-search','f-date-from','f-date-to'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (el.tagName === 'SELECT') el.value = 'all';
        else if (el.type === 'date') el.value = '';
        else el.value = '';
      }
    });
    refreshAll();
  });
}

// Init filters (employees/products datalists) - unchanged
async function loadEmployeesForFilter() {
  const sel = document.getElementById("f-emp");
  if (!sel) return;
  sel.innerHTML = `<option value="all">All Employees</option>`;
  try {
    const snap = await getDocs(collection(db, "employees"));
    const emps = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        name: (data.fullName || data.name || data.email || d.id || "").trim()
      };
    }).filter(e => e.name);
    emps.sort((a, b) => a.name.localeCompare(b.name));
    emps.forEach(e => {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = e.name;
      sel.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load employees for performance filter:", err);
  }
}

async function loadProductsForFilter() {
  const input = document.getElementById("f-prod-search");
  if (!input) return;
  const names = new Set();
  try {
    const ratesSnap = await getDocs(collection(db, "rates_productions"));
    ratesSnap.forEach((d) => {
      const data = d.data() || {};
      const name = (data.name || data.productName || "").trim();
      if (name) names.add(name);
    });
    const invSnap = await getDocs(collection(db, "inventory"));
    invSnap.forEach((d) => {
      const data = d.data() || {};
      const cat = String(data.category || "").toLowerCase();
      if (cat.includes("finished")) {
        const name = (data.name || "").trim();
        if (name) names.add(name);
      }
    });
    const listId = "perf-product-list";
    let dl = document.getElementById(listId);
    if (!dl) {
      dl = document.createElement("datalist");
      dl.id = listId;
      document.body.appendChild(dl);
    }
    const sorted = Array.from(names).sort((a, b) => a.localeCompare(b));
    dl.innerHTML = sorted.map(n => `<option value="${n}"></option>`).join("");
    input.setAttribute("list", listId);
  } catch (err) {
    console.error("Failed to load products for performance filter:", err);
  }
}

// Main init
async function init() {
  if (!(await loadBaseData())) return;
  
  await Promise.all([loadEmployeesForFilter(), loadProductsForFilter()]);
  setupFilters();
  refreshAll();
}

// Load when ready
if (window.location.hash === '#embed') {
  document.body.classList.add('embed-mode');
  document.querySelector('.wrap')?.remove();
  const mainContent = document.querySelector('.content .inner, main .inner') || document.querySelector('main') || document.body;
  mainContent.style.height = '100vh';
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

