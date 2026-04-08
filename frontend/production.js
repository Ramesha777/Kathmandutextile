import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

onAuthStateChanged(auth, (user) => {
  if (!user) window.location.replace("login.html");
});
document.getElementById("btnSignOut")?.addEventListener("click", async () => {
  try { await signOut(auth); window.location.replace("login.html"); } catch (e) { console.error(e); }
});

// ── Chart helpers ──
const AMBER = "#f59e0b", EMERALD = "#10b981", SKY = "#38bdf8";
const GRID = "rgba(255,255,255,0.06)", TMUTED = "#64748b", TSEC = "#94a3b8", TPRI = "#f0f4ff";
const TOOLTIP = {
  backgroundColor: "rgba(11,15,30,0.95)", titleColor: TPRI, bodyColor: TSEC,
  borderColor: AMBER, borderWidth: 1, padding: 10, cornerRadius: 8,
  titleFont: { family: "'DM Sans',sans-serif", weight: "600" },
  bodyFont: { family: "'DM Sans',sans-serif" },
};
function rgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function escapeHtml(str) {
  if (str == null || str === "") return "\u2014";
  const d = document.createElement("div");
  d.textContent = String(str);
  return d.innerHTML;
}

// ── State ──
let cachedWageEntries = [];
let cachedSales = { byProduct: {}, dates: [], cumValues: [] };
let chartBar = null, chartPie = null, chartLine = null;

// ── Data loaders ──
async function loadProductionWageEntries() {
  const snap = await getDocs(collection(db, "wageEntries"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((w) => String(w.department || "").trim() === "Production");
}

async function loadApprovedOrderSales() {
  const snap = await getDocs(collection(db, "orders"));
  const byProduct = {};
  const timeline = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    if (data.status !== "approved") return;
    const products = Array.isArray(data.products) ? data.products : [];
    if (products.length > 0) {
      for (const p of products) {
        const name = String(p.productName || "").trim();
        const qty = Number(p.quantity) || 0;
        if (!name || qty <= 0) continue;
        byProduct[name] = (byProduct[name] || 0) + qty;
        if (data.createdAt?.toDate) try { timeline.push({ date: data.createdAt.toDate(), qty }); } catch (_) {}
      }
    } else {
      const name = String(data.productName || "").trim();
      const qty = Number(data.quantity) || 0;
      if (!name || qty <= 0) return;
      byProduct[name] = (byProduct[name] || 0) + qty;
      if (data.createdAt?.toDate) try { timeline.push({ date: data.createdAt.toDate(), qty }); } catch (_) {}
    }
  });
  timeline.sort((a, b) => a.date - b.date);
  const byDay = new Map();
  for (const { date, qty } of timeline) {
    const key = date.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + qty);
  }
  const dates = Array.from(byDay.keys()).sort();
  let cum = 0;
  const cumValues = dates.map((d) => { cum += byDay.get(d) || 0; return cum; });
  return { byProduct, dates, cumValues };
}

// ── Filters ──
function getFilterValues() {
  const item = document.getElementById("fl-item")?.value || "all";
  const from = document.getElementById("fl-from")?.value || "";
  const to = document.getElementById("fl-to")?.value || "";
  return { item, from, to };
}

function applyFilters(entries) {
  const { item, from, to } = getFilterValues();
  let filtered = entries;
  if (item !== "all") filtered = filtered.filter((w) => String(w.item || "").trim() === item);
  if (from) filtered = filtered.filter((w) => (w.date || "") >= from);
  if (to) filtered = filtered.filter((w) => (w.date || "") <= to);
  return filtered;
}

function populateItemFilter(entries) {
  const el = document.getElementById("fl-item");
  if (!el) return;
  const current = el.value || "all";
  const items = [...new Set(entries.map((w) => String(w.item || "").trim()).filter(Boolean))].sort();
  el.innerHTML = `<option value="all">All Items</option>` +
    items.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  if (current !== "all" && items.includes(current)) el.value = current;
}

// ── Build summary ──
function buildProductSummary(filteredEntries, sales) {
  const producedMap = {};
  for (const w of filteredEntries) {
    const name = String(w.item || "").trim();
    const qty = Number(w.qty) || 0;
    if (!name || qty <= 0) continue;
    producedMap[name] = (producedMap[name] || 0) + qty;
  }
  const allNames = [...new Set([...Object.keys(producedMap), ...Object.keys(sales.byProduct)])].sort();
  return allNames.map((name) => {
    const produced = producedMap[name] || 0;
    const sold = sales.byProduct[name] || 0;
    return { name, produced, sold, remaining: produced - sold };
  });
}

// ── Render stats ──
function renderStats(products) {
  let totProduced = 0, totSold = 0;
  products.forEach((p) => { totProduced += p.produced; totSold += p.sold; });
  const sell = totProduced > 0 ? (totSold / totProduced) * 100 : 0;
  const vals = document.querySelectorAll("#pl-stats .pl-stat-card .pl-stat-value");
  if (vals[0]) vals[0].textContent = totProduced.toLocaleString();
  if (vals[1]) vals[1].textContent = totSold.toLocaleString();
  if (vals[2]) vals[2].textContent = String(products.length);
  if (vals[3]) vals[3].textContent = sell.toFixed(1);
}

// ── Render table ──
function renderTable(products) {
  const tbody = document.getElementById("pl-tbody");
  const tfoot = document.getElementById("pl-tfoot");
  if (!tbody || !tfoot) return;
  tbody.innerHTML = "";
  tfoot.innerHTML = "";
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:1.25rem;">No production data for this filter.</td></tr>`;
    return;
  }
  let totP = 0, totS = 0, totR = 0;
  products.forEach((p) => {
    totP += p.produced; totS += p.sold; totR += p.remaining;
    const pct = p.produced > 0 ? (p.sold / p.produced) * 100 : 0;
    const cls = pct >= 75 ? "pl-badge-green" : pct >= 40 ? "pl-badge-amber" : "pl-badge-red";
    tbody.innerHTML += `<tr>
      <td class="pl-td-name">${escapeHtml(p.name)}</td>
      <td>${p.produced.toLocaleString()}</td><td>${p.sold.toLocaleString()}</td>
      <td>${p.remaining.toLocaleString()}</td>
      <td><span class="pl-badge ${cls}">${pct.toFixed(1)}%</span></td></tr>`;
  });
  tfoot.innerHTML = `<td><strong>Total</strong></td><td><strong>${totP.toLocaleString()}</strong></td><td><strong>${totS.toLocaleString()}</strong></td><td><strong>${totR.toLocaleString()}</strong></td><td>\u2014</td>`;
}

// ── Employee records table ──
function renderEmployeeRecords(filtered) {
  const tbody = document.getElementById("pl-emp-tbody");
  if (!tbody) return;
  const sorted = [...filtered].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:1.25rem;">No employee production records for this filter.</td></tr>`;
    return;
  }
  tbody.innerHTML = sorted.map((w) => `<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
    <td>${escapeHtml(w.date)}</td>
    <td>${escapeHtml(w.employeeName || w.employeeId || "\u2014")}</td>
    <td>${escapeHtml(w.item)}</td>
    <td>${Number(w.qty || 0).toLocaleString()}</td>
    <td>${escapeHtml(w.unit)}</td>
    <td>${Number(w.rate || 0).toLocaleString()}</td>
    <td><strong style="color:#f59e0b;">Rs. ${Number(w.net || 0).toLocaleString()}</strong></td>
  </tr>`).join("");
}

// ── Charts ──
function renderCharts(products, salesTimeline) {
  const labels = products.map((p) => p.name);
  const produced = products.map((p) => p.produced);
  const sold = products.map((p) => p.sold);
  const colors = ["#f59e0b", "#38bdf8", "#10b981", "#f43f5e", "#8b5cf6", "#fb923c", "#2dd4bf"];

  if (chartBar) chartBar.destroy();
  if (chartPie) chartPie.destroy();
  if (chartLine) chartLine.destroy();

  const barEl = document.getElementById("barChart");
  const pieEl = document.getElementById("pieChart");
  const lineEl = document.getElementById("lineChart");

  if (barEl) {
    chartBar = new Chart(barEl, {
      type: "bar",
      data: { labels, datasets: [
        { label: "Produced (wage entries)", data: produced, backgroundColor: rgba(AMBER, .72), borderColor: AMBER, borderWidth: 1, borderRadius: 5, borderSkipped: false },
        { label: "Sold (approved orders)", data: sold, backgroundColor: rgba(EMERALD, .62), borderColor: EMERALD, borderWidth: 1, borderRadius: 5, borderSkipped: false },
      ]},
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: TSEC, font: { family: "'DM Sans',sans-serif", size: 12 }, usePointStyle: true, pointStyleWidth: 10, padding: 14 }}, title: { display: true, text: "Production vs Sales by Item", color: TPRI, font: { family: "'Playfair Display',serif", size: 14, weight: "600" }, padding: { bottom: 14 }}, tooltip: TOOLTIP },
        scales: { x: { ticks: { color: TMUTED, font: { size: 11 }}, grid: { color: GRID }}, y: { ticks: { color: TMUTED, font: { size: 11 }}, grid: { color: GRID }, beginAtZero: true, title: { display: true, text: "Quantity", color: TMUTED, font: { size: 11 }}}}
      },
    });
  }

  if (pieEl) {
    chartPie = new Chart(pieEl, {
      type: "doughnut",
      data: { labels, datasets: [{ data: produced, backgroundColor: produced.map((_, i) => rgba(colors[i % colors.length], .75)), borderColor: produced.map((_, i) => colors[i % colors.length]), borderWidth: 2, hoverOffset: 8 }]},
      options: { responsive: true, maintainAspectRatio: false, cutout: "60%",
        plugins: { legend: { position: "right", labels: { color: TSEC, font: { family: "'DM Sans',sans-serif", size: 11 }, padding: 12, usePointStyle: true, pointStyleWidth: 10 }}, title: { display: true, text: "Production Share by Item", color: TPRI, font: { family: "'Playfair Display',serif", size: 14, weight: "600" }, padding: { bottom: 12 }}, tooltip: TOOLTIP },
      },
    });
  }

  if (lineEl) {
    const { dates, cumValues } = salesTimeline;
    chartLine = new Chart(lineEl, {
      type: "line",
      data: { labels: dates.map((d) => new Date(d).toLocaleDateString()), datasets: [{ label: "Cumulative Sales (approved orders)", data: cumValues, borderColor: SKY, backgroundColor: rgba(SKY, .08), pointBackgroundColor: SKY, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5, fill: true, tension: .4 }]},
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: TSEC, font: { family: "'DM Sans',sans-serif", size: 12 }, usePointStyle: true, pointStyleWidth: 10, padding: 14 }}, title: { display: true, text: "Cumulative Sales Trend", color: TPRI, font: { family: "'Playfair Display',serif", size: 14, weight: "600" }, padding: { bottom: 14 }}, tooltip: TOOLTIP },
        scales: { x: { ticks: { color: TMUTED, font: { size: 11 }}, grid: { color: GRID }}, y: { ticks: { color: TMUTED, font: { size: 11 }}, grid: { color: GRID }, beginAtZero: true, title: { display: true, text: "Cumulative Qty", color: TMUTED, font: { size: 11 }}}}
      },
    });
  }
}

// ── Master render ──
function renderAll() {
  const filtered = applyFilters(cachedWageEntries);
  const products = buildProductSummary(filtered, cachedSales);
  renderStats(products);
  renderTable(products);
  renderEmployeeRecords(filtered);
  renderCharts(products, cachedSales);
}

// ── Init ──
async function loadAll() {
  try {
    [cachedWageEntries, cachedSales] = await Promise.all([
      loadProductionWageEntries(),
      loadApprovedOrderSales(),
    ]);
    populateItemFilter(cachedWageEntries);
    renderAll();
  } catch (err) {
    console.error("Failed to load production log:", err);
  }
}

function setDefaultDates() {
  const fromEl = document.getElementById("fl-from");
  const toEl = document.getElementById("fl-to");
  if (toEl) toEl.value = new Date().toISOString().slice(0, 10);
  if (fromEl) {
    const d = new Date(); d.setDate(d.getDate() - 30);
    fromEl.value = d.toISOString().slice(0, 10);
  }
}

// ── Filter button wiring ──
document.getElementById("fl-apply")?.addEventListener("click", () => renderAll());
document.getElementById("fl-reset")?.addEventListener("click", () => {
  const el = document.getElementById("fl-item");
  if (el) el.value = "all";
  setDefaultDates();
  renderAll();
});
document.getElementById("fl-refresh")?.addEventListener("click", () => loadAll());

// Make initProductionLog available globally for Admin.js
window.initProductionLog = loadAll;

setDefaultDates();
loadAll();
