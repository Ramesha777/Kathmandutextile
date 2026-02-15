// employee.js – Add inventory, report problems, view inventory & damage reports (Firestore)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const messageEl = document.getElementById("employeeMessage");
const inventoryForm = document.getElementById("inventoryForm");
const problemForm = document.getElementById("problemForm");
const storageSelect = document.getElementById("invStorageArea");
const storageOther = document.getElementById("invStorageOther");
const logoutBtn = document.getElementById("logoutBtn");
const inventoryListEl = document.getElementById("inventoryList");
const damageReportsListEl = document.getElementById("damageReportsList");

function escapeHtml(str) {
  if (str == null) return "—";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

function showPanel(sectionId) {
  document.querySelectorAll(".employee-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".employee-nav-link").forEach((a) => a.classList.remove("active"));
  const panel = document.getElementById("panel-" + sectionId);
  const link = document.querySelector('.employee-nav-link[data-section="' + sectionId + '"]');
  if (panel) panel.classList.add("active");
  if (link) link.classList.add("active");
  if (sectionId === "view-inventory") loadInventoryList();
  if (sectionId === "damage-reports") loadDamageReports();
}

function showMessage(text, isError = false) {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.className = "employee-message " + (isError ? "error" : "success");
  messageEl.style.display = "block";
  setTimeout(() => {
    messageEl.style.display = "none";
  }, 5000);
}

function getStorageArea() {
  const val = storageSelect?.value || "";
  if (val === "Other") {
    return (storageOther?.value || "").trim() || "Other";
  }
  return val;
}

if (storageSelect && storageOther) {
  storageSelect.addEventListener("change", () => {
    storageOther.style.display = storageSelect.value === "Other" ? "block" : "none";
  });
}

if (inventoryForm) {
  inventoryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const barcode = document.getElementById("invBarcode")?.value?.trim();
    const name = document.getElementById("invName")?.value?.trim();
    const category = document.getElementById("invCategory")?.value;
    const vendorName = document.getElementById("invVendorName")?.value?.trim();
    const vendorContact = document.getElementById("invVendorContact")?.value?.trim();
    const vendorAddress = document.getElementById("invVendorAddress")?.value?.trim();
    const purchaseDate = document.getElementById("invPurchaseDate")?.value || null;
    const expiryDate = document.getElementById("invExpiryDate")?.value || null;
    const storageArea = getStorageArea();

    if (!barcode || !name || !category) {
      showMessage("Please fill Barcode/ID, Name and Category.", true);
      return;
    }

    const submitBtn = inventoryForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Adding…";
    }
    try {
      await addDoc(collection(db, "inventory"), {
        barcode,
        name,
        category,
        vendorName: vendorName || null,
        vendorContact: vendorContact || null,
        vendorAddress: vendorAddress || null,
        purchaseDate: purchaseDate || null,
        expiryDate: expiryDate || null,
        storageArea: storageArea || null,
        createdBy: auth.currentUser?.uid || null,
        createdAt: serverTimestamp()
      });
      showMessage("Inventory item added successfully.");
      inventoryForm.reset();
      if (storageOther) storageOther.style.display = "none";
    } catch (err) {
      showMessage("Failed to add: " + (err.message || err), true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Add to inventory";
      }
    }
  });
}

if (problemForm) {
  problemForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const barcode = document.getElementById("probBarcode")?.value?.trim();
    const name = document.getElementById("probName")?.value?.trim();
    const explanation = document.getElementById("probExplanation")?.value?.trim();

    if (!barcode || !name || !explanation) {
      showMessage("Please fill Barcode, Name and Explanation.", true);
      return;
    }

    const submitBtn = problemForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
    }
    try {
      await addDoc(collection(db, "problem_reports"), {
        barcode,
        name,
        explanation,
        reportedBy: auth.currentUser?.uid || null,
        reportedAt: serverTimestamp()
      });
      showMessage("Problem report submitted successfully.");
      problemForm.reset();
    } catch (err) {
      showMessage("Failed to submit report: " + (err.message || err), true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit report";
      }
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.replace("login.html");
    } catch (err) {
      showMessage("Logout failed: " + (err.message || err), true);
    }
  });
}

// ─── View All Inventory ───
async function loadInventoryList() {
  if (!inventoryListEl) return;
  inventoryListEl.innerHTML = "<p class='loading-msg'>Loading inventory…</p>";
  try {
    const snap = await getDocs(collection(db, "inventory"));
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    if (items.length === 0) {
      inventoryListEl.innerHTML = "<p class='empty-msg'>No inventory items yet.</p>";
      return;
    }
    let html = `
      <table class="emp-table">
        <thead>
          <tr>
            <th>Barcode/ID</th>
            <th>Name</th>
            <th>Category</th>
            <th>Vendor</th>
            <th>Purchase date</th>
            <th>Expiry date</th>
            <th>Storage area</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const x of items) {
      const purchaseDate = x.purchaseDate || "—";
      const expiryDate = x.expiryDate || "—";
      html += `
        <tr>
          <td>${escapeHtml(x.barcode)}</td>
          <td>${escapeHtml(x.name)}</td>
          <td>${escapeHtml(x.category)}</td>
          <td>${escapeHtml(x.vendorName || "—")}</td>
          <td>${escapeHtml(purchaseDate)}</td>
          <td>${escapeHtml(expiryDate)}</td>
          <td>${escapeHtml(x.storageArea || "—")}</td>
        </tr>
      `;
    }
    html += "</tbody></table>";
    inventoryListEl.innerHTML = html;
  } catch (err) {
    inventoryListEl.innerHTML = "<p class='error'>Failed to load inventory: " + escapeHtml(err.message || err) + "</p>";
  }
}

// ─── View Damage Reports ───
async function loadDamageReports() {
  if (!damageReportsListEl) return;
  damageReportsListEl.innerHTML = "<p class='loading-msg'>Loading damage reports…</p>";
  try {
    const snap = await getDocs(collection(db, "problem_reports"));
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.reportedAt?.toMillis?.() ?? 0) - (a.reportedAt?.toMillis?.() ?? 0));
    if (items.length === 0) {
      damageReportsListEl.innerHTML = "<p class='empty-msg'>No damage reports yet.</p>";
      return;
    }
    let html = `
      <table class="emp-table">
        <thead>
          <tr>
            <th>Barcode/ID</th>
            <th>Product name</th>
            <th>Explanation</th>
            <th>Reported at</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const x of items) {
      let reportedAt = "—";
      if (x.reportedAt?.toDate) {
        try {
          reportedAt = x.reportedAt.toDate().toLocaleString();
        } catch (_) {}
      }
      html += `
        <tr>
          <td>${escapeHtml(x.barcode)}</td>
          <td>${escapeHtml(x.name)}</td>
          <td>${escapeHtml(x.explanation)}</td>
          <td>${escapeHtml(reportedAt)}</td>
        </tr>
      `;
    }
    html += "</tbody></table>";
    damageReportsListEl.innerHTML = html;
  } catch (err) {
    damageReportsListEl.innerHTML = "<p class='error'>Failed to load reports: " + escapeHtml(err.message || err) + "</p>";
  }
}

// Nav: switch section
document.querySelectorAll(".employee-nav-link").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const section = a.getAttribute("data-section");
    if (section) showPanel(section);
  });
});
