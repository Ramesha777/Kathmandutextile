import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

// ── Firebase init & auth guard ──
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("login.html");
  }
});

document.getElementById("btnSignOut")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.replace("login.html");
  } catch (err) {
    console.error("Sign out failed", err);
  }
});

// ── Shared chart defaults ──
const AMBER = "#f59e0b", EMERALD = "#10b981", SKY = "#38bdf8";
const GRID = "rgba(255,255,255,0.06)", TMUTED = "#64748b", TSEC = "#94a3b8", TPRI = "#f0f4ff";
const TOOLTIP = {
  backgroundColor: "rgba(11,15,30,0.95)", titleColor: TPRI, bodyColor: TSEC,
  borderColor: AMBER, borderWidth: 1, padding: 10, cornerRadius: 8,
  titleFont: { family: "'DM Sans',sans-serif", weight: "600" },
  bodyFont: { family: "'DM Sans',sans-serif" }
};
function rgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Load data from Firestore ──
async function loadInventoryFinishedProducts() {
  const snap = await getDocs(collection(db, "inventory"));
  const byProduct = {};
  snap.forEach((d) => {
    const data = d.data() || {};
    const cat = String(data.category || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (cat !== "finished product") return;
    const name = (data.name || data.productName || d.id || "Unknown").trim();
    const qty = Number(data.quantity) || 0;
    if (!name) return;
    byProduct[name] = (byProduct[name] || 0) + qty;
  });
  return byProduct;
}

async function loadApprovedOrderSales() {
  const snap = await getDocs(collection(db, "orders"));
  const byProduct = {};
  const timeline = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    if (data.status !== "approved") return;
    const name = (data.productName || d.id || "Unknown").trim();
    const qty = Number(data.quantity) || 0;
    if (!name || !(qty > 0)) return;
    byProduct[name] = (byProduct[name] || 0) + qty;
    if (data.createdAt?.toDate) {
      try {
        const date = data.createdAt.toDate();
        timeline.push({ date, qty });
      } catch {
        // ignore parse errors
      }
    }
  });
  // sort timeline by date
  timeline.sort((a, b) => a.date - b.date);
  // compress by day
  const byDay = new Map();
  for (const { date, qty } of timeline) {
    const key = date.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + qty);
  }
  const dates = Array.from(byDay.keys()).sort();
  let cum = 0;
  const cumValues = dates.map((d) => {
    cum += byDay.get(d) || 0;
    return cum;
  });
  return { byProduct, dates, cumValues };
}

// ── Render dashboard from data ──
function renderStatsAndTable(products) {
  const tbody = document.getElementById("pl-tbody");
  const tfoot = document.getElementById("pl-tfoot");
  if (!tbody || !tfoot) return;
  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  let totProduced = 0, totSold = 0, totRemain = 0;

  products.forEach((p) => {
    totProduced += p.produced;
    totSold += p.sold;
    totRemain += p.remaining;
    const pct = p.produced > 0 ? ((p.sold / p.produced) * 100) : 0;
    const pctStr = pct.toFixed(1);
    const cls = pct >= 75 ? "pl-badge-green" : pct >= 40 ? "pl-badge-amber" : "pl-badge-red";
    tbody.innerHTML += `
      <tr>
        <td class="pl-td-name">${p.name}</td>
        <td>${p.produced.toLocaleString()}</td>
        <td>${p.sold.toLocaleString()}</td>
        <td>${p.remaining.toLocaleString()}</td>
        <td><span class="pl-badge ${cls}">${pctStr}%</span></td>
      </tr>`;
  });

  tfoot.innerHTML = `
    <td><strong>Total</strong></td>
    <td><strong>${totProduced.toLocaleString()}</strong></td>
    <td><strong>${totSold.toLocaleString()}</strong></td>
    <td><strong>${totRemain.toLocaleString()}</strong></td>
    <td>—</td>
  `;

  // Top stat cards
  const statEls = document.querySelectorAll("#pl-stats .pl-stat-card .pl-stat-value");
  if (statEls[0]) statEls[0].textContent = totProduced.toLocaleString(); // Total Produced
  if (statEls[1]) statEls[1].textContent = totSold.toLocaleString();     // Total Sold
  if (statEls[2]) statEls[2].textContent = String(products.length);      // Product Types
  const sellThrough = totProduced > 0 ? (totSold / totProduced) * 100 : 0;
  if (statEls[3]) statEls[3].textContent = sellThrough.toFixed(1);       // Sell-through %
}

function renderCharts(products, salesTimeline) {
  const itemLabels = products.map((p) => p.name);
  const producedData = products.map((p) => p.produced);
  const soldData = products.map((p) => p.sold);
  const remainingData = products.map((p) => p.remaining);
  const colors = ["#f59e0b", "#38bdf8", "#10b981", "#f43f5e", "#8b5cf6", "#fb923c", "#2dd4bf"];

  // Bar chart: Production vs Sales per item
  new Chart(document.getElementById("barChart"), {
    type: "bar",
    data: {
      labels: itemLabels,
      datasets: [
        {
          label: "Produced (sold + remaining)",
          data: producedData,
          backgroundColor: rgba(AMBER, .72),
          borderColor: AMBER,
          borderWidth: 1,
          borderRadius: 5,
          borderSkipped: false
        },
        {
          label: "Sold (approved orders)",
          data: soldData,
          backgroundColor: rgba(EMERALD, .62),
          borderColor: EMERALD,
          borderWidth: 1,
          borderRadius: 5,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: {
            color: TSEC,
            font: { family: "'DM Sans',sans-serif", size: 12 },
            usePointStyle: true,
            pointStyleWidth: 10,
            padding: 14
          }
        },
        title: {
          display: true,
          text: "Production vs Sales by Item",
          color: TPRI,
          font: { family: "'Playfair Display',serif", size: 14, weight: "600" },
          padding: { bottom: 14 }
        },
        tooltip: TOOLTIP
      },
      scales: {
        x: { ticks: { color: TMUTED, font: { size: 11 } }, grid: { color: GRID } },
        y: {
          ticks: { color: TMUTED, font: { size: 11 } },
          grid: { color: GRID },
          beginAtZero: true,
          title: {
            display: true,
            text: "Quantity",
            color: TMUTED,
            font: { size: 11 }
          }
        }
      }
    }
  });

  // Pie chart: Production share by item
  new Chart(document.getElementById("pieChart"), {
    type: "doughnut",
    data: {
      labels: itemLabels,
      datasets: [{
        data: producedData,
        backgroundColor: producedData.map((_, i) => rgba(colors[i % colors.length], .75)),
        borderColor: producedData.map((_, i) => colors[i % colors.length]),
        borderWidth: 2,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "60%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: TSEC,
            font: { family: "'DM Sans',sans-serif", size: 11 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 10
          }
        },
        title: {
          display: true,
          text: "Production Share by Item",
          color: TPRI,
          font: { family: "'Playfair Display',serif", size: 14, weight: "600" },
          padding: { bottom: 12 }
        },
        tooltip: TOOLTIP
      }
    }
  });

  // Line chart: cumulative sales over time (approved orders)
  const dates = salesTimeline.dates;
  const cumValues = salesTimeline.cumValues;
  new Chart(document.getElementById("lineChart"), {
    type: "line",
    data: {
      labels: dates.length ? dates.map(d => new Date(d).toLocaleDateString()) : [],
      datasets: [
        {
          label: "Cumulative Sales (approved orders)",
          data: cumValues,
          borderColor: SKY,
          backgroundColor: rgba(SKY, .08),
          pointBackgroundColor: SKY,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          fill: true,
          tension: .4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: {
            color: TSEC,
            font: { family: "'DM Sans',sans-serif", size: 12 },
            usePointStyle: true,
            pointStyleWidth: 10,
            padding: 14
          }
        },
        title: {
          display: true,
          text: "Cumulative Sales Trend (Approved Orders)",
          color: TPRI,
          font: { family: "'Playfair Display',serif", size: 14, weight: "600" },
          padding: { bottom: 14 }
        },
        tooltip: TOOLTIP
      },
      scales: {
        x: { ticks: { color: TMUTED, font: { size: 11 } }, grid: { color: GRID } },
        y: {
          ticks: { color: TMUTED, font: { size: 11 } },
          grid: { color: GRID },
          beginAtZero: true,
          title: {
            display: true,
            text: "Cumulative Qty",
            color: TMUTED,
            font: { size: 11 }
          }
        }
      }
    }
  });
}

// ── Main load ──
async function initProductionLog() {
  try {
    const [invMap, sales] = await Promise.all([
      loadInventoryFinishedProducts(),
      loadApprovedOrderSales()
    ]);

    const productNames = Array.from(new Set([
      ...Object.keys(invMap),
      ...Object.keys(sales.byProduct)
    ])).sort((a, b) => a.localeCompare(b));

    const products = productNames.map((name) => {
      const remaining = invMap[name] || 0;
      const sold = sales.byProduct[name] || 0;
      const produced = remaining + sold;
      return { name, produced, sold, remaining };
    });

    renderStatsAndTable(products);
    renderCharts(products, sales);
  } catch (err) {
    console.error("Failed to load production log", err);
  }
}

initProductionLog();

// ── Filter reset (UI only: resets inputs, not server data) ──
document.getElementById("fl-reset").addEventListener("click", () => {
  document.getElementById("fl-item").value = "all";
  document.getElementById("fl-month").value = "all";
  document.getElementById("fl-from").value = "";
  document.getElementById("fl-to").value = "";
});

