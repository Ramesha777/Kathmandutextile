// dashboard.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ── Your Firebase config ──
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:xxxxxxxxxxxxxxxxxxxxxx"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── Auth protection ──
onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.href = "index.html"; // or your login page
  } else {
    loadEmployees();
  }
});

// ── Logout ──
document.getElementById("logoutBtn").onclick = () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
};

// ── Navigation ──
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
    item.classList.add("active");

    document.querySelectorAll(".tab-content").forEach(tab => {
      tab.style.display = "none";
    });
    document.getElementById(item.dataset.tab).style.display = "block";
  });
});

// ── Toast helper ──
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove("show"), 3200);
}

// ── Load employees ──
async function loadEmployees() {
  try {
    const employeesSnap = await getDocs(collection(db, "employees"));
    const employees = employeesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Fill employees table
    const tbody = document.querySelector("#tbl-employees tbody");
    tbody.innerHTML = "";
    employees.forEach(emp => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${emp.id}</td>
        <td>${emp.name || "—"}</td>
        <td>${emp.email || "—"}</td>
        <td>${emp.department || "—"}</td>
        <td>${emp.position || "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    // Fill selects
    const options = employees.map(e => `<option value="${e.id}">${e.name || e.email} (${e.id})</option>`).join("");
    document.getElementById("wage-employee").innerHTML = `<option value="">Select employee</option>` + options;
    document.getElementById("slip-employee").innerHTML = `<option value="">Select employee</option>` + options;

  } catch (err) {
    console.error(err);
    showToast("Failed to load employees", "error");
  }
}

// ── Save wage entry ──
document.getElementById("btn-save-wage").addEventListener("click", async () => {
  const employeeId = document.getElementById("wage-employee").value;
  const date       = document.getElementById("wage-date").value;
  const dept       = document.getElementById("wage-dept").value;
  const item       = document.getElementById("wage-item").value.trim();
  const qty        = Number(document.getElementById("wage-qty").value)   || 0;
  const rate       = Number(document.getElementById("wage-rate").value)  || 0;
  const ot         = Number(document.getElementById("wage-ot").value)    || 0;
  const bonus      = Number(document.getElementById("wage-bonus").value) || 0;
  const deduct     = Number(document.getElementById("wage-deduct").value)|| 0;

  if (!employeeId || !date || !item) {
    showToast("Please fill required fields", "error");
    return;
  }

  const wages  = qty * rate;
  const otPay  = ot * (rate / 8) * 1.5; // 1.5× hourly rate (assuming 8h day)
  const net    = wages + otPay + bonus - deduct;

  try {
    await addDoc(collection(db, "wageEntries"), {
      employeeId,
      date,
      department: dept || null,
      item,
      qty, rate, wages,
      ot, otPay,
      bonus, deduct, net,
      createdAt: new Date()
    });

    showToast("Wage entry saved successfully");
    clearWageForm();
  } catch (err) {
    console.error(err);
    showToast("Error saving wage entry", "error");
  }
});

function clearWageForm() {
  document.getElementById("wage-employee").value = "";
  document.getElementById("wage-date").value = "";
  document.getElementById("wage-dept").value = "";
  document.getElementById("wage-item").value = "";
  document.getElementById("wage-qty").value = "0";
  document.getElementById("wage-rate").value = "0";
  document.getElementById("wage-ot").value = "0";
  document.getElementById("wage-bonus").value = "0";
  document.getElementById("wage-deduct").value = "0";
}

document.getElementById("btn-clear-wage").addEventListener("click", clearWageForm);

// ── Payslip logic ──
async function getMonthlySummary(empId, monthName) {
  const employeesSnap = await getDocs(collection(db, "employees"));
  const employee = employeesSnap.docs.find(d => d.id === empId)?.data();
  if (!employee) return null;

  const wageSnap = await getDocs(collection(db, "wageEntries"));
  let totalW = 0, totalOT = 0, totalBonus = 0, totalDeduct = 0;

  wageSnap.forEach(doc => {
    const entry = doc.data();
    if (entry.employeeId === empId) {
      const entryMonth = new Date(entry.date).toLocaleString('default', { month: 'long' });
      if (entryMonth === monthName) {
        totalW     += entry.wages  || 0;
        totalOT    += entry.otPay  || 0;
        totalBonus += entry.bonus  || 0;
        totalDeduct+= entry.deduct || 0;
      }
    }
  });

  return {
    name: employee.name || employee.email || "Unknown",
    wages: totalW,
    otPay: totalOT,
    bonus: totalBonus,
    deduct: totalDeduct,
    net: totalW + totalOT + totalBonus - totalDeduct
  };
}

document.getElementById("btn-preview-slip").addEventListener("click", async () => {
  const empId = document.getElementById("slip-employee").value;
  const month = document.getElementById("slip-month").value;

  if (!empId || !month) {
    showToast("Please select employee and month", "error");
    return;
  }

  const summary = await getMonthlySummary(empId, month);
  if (!summary || summary.net === 0) {
    showToast("No wage data found for this month", "error");
    return;
  }

  document.getElementById("summary-month").textContent = month;
  document.getElementById("summary-content").innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 1.05rem;">
      <div><strong>Employee:</strong> ${summary.name}</div>
      <div><strong>Month:</strong> ${month}</div>
      <div><strong>Wages:</strong> Rs. ${summary.wages.toLocaleString()}</div>
      <div><strong>Overtime:</strong> Rs. ${summary.otPay.toLocaleString()}</div>
      <div><strong>Bonus:</strong> Rs. ${summary.bonus.toLocaleString()}</div>
      <div><strong>Deduction:</strong> Rs. ${summary.deduct.toLocaleString()}</div>
      <div style="grid-column: 1 / -1; height: 1px; background: var(--border); margin: 12px 0;"></div>
      <div style="grid-column: 1 / -1; font-size: 1.4rem; font-weight: 700; color: #67e8f9;">
        Net Pay: Rs. ${summary.net.toLocaleString()}
      </div>
    </div>
  `;

  document.getElementById("slip-summary").style.display = "block";
});

document.getElementById("btn-download-slip").addEventListener("click", async () => {
  const empId = document.getElementById("slip-employee").value;
  const month = document.getElementById("slip-month").value;

  if (!empId || !month) {
    showToast("Please select employee and month", "error");
    return;
  }

  const summary = await getMonthlySummary(empId, month);
  if (!summary || summary.net === 0) {
    showToast("No data to generate payslip", "error");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Kathmandu Textile Industry", 105, 30, { align: "center" });
  doc.setFontSize(14);
  doc.text(`Payslip — ${month}`, 105, 48, { align: "center" });

  doc.autoTable({
    startY: 70,
    head: [["Description", "Amount (Rs)"]],
    body: [
      ["Basic Wages",      summary.wages.toLocaleString()],
      ["Overtime Pay",     summary.otPay.toLocaleString()],
      ["Bonus",            summary.bonus.toLocaleString()],
      ["Deductions",      `-${summary.deduct.toLocaleString()}`],
      ["NET PAY",          summary.net.toLocaleString()]
    ],
    theme: "grid",
    headStyles: { fillColor: [34, 211, 238], textColor: [0,1,25] },
    styles: { fontSize: 11 }
  });

  doc.save(`payslip_${empId.replace(/\s+/g,'_')}_${month}.pdf`);
});

// Initial load
loadEmployees();