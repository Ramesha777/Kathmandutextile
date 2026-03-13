// employee.js – Add inventory, report problems, view inventory & damage reports (Firestore)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


// DOM elements

const messageEl = document.getElementById("employeeMessage");
const inventoryForm = document.getElementById("inventoryForm");
const problemForm = document.getElementById("problemForm");
const storageSelect = document.getElementById("invStorageArea");
const storageOther = document.getElementById("invStorageOther");
const logoutBtn = document.getElementById("logoutBtn");
const inventoryListEl = document.getElementById("inventoryList");
const inventoryCategoryFilterEl = document.getElementById("inventoryCategoryFilter");
const damageReportsListEl = document.getElementById("damageReportsList");

// Employee table elements
const employeeSearchInput = document.getElementById('employee-search');
const employeeModal = document.getElementById('employee-modal');
const employeeModalBody = document.getElementById('employee-modal-body');
const modalCloseEmployee = document.getElementById('modal-close-employee');


// Utility functions

function escapeHtml(str) {
  if (str == null) return "—";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

// Show a specific panel and hide others


function showPanel(sectionId) {
  document.querySelectorAll(".employee-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".employee-nav-link").forEach((a) => a.classList.remove("active"));
  const panel = document.getElementById("panel-" + sectionId);
  const link = document.querySelector('.employee-nav-link[data-section="' + sectionId + '"]');
  if (panel) panel.classList.add("active");
  if (link) link.classList.add("active");
  if (sectionId === "view-inventory") loadInventoryList();
  if (sectionId === "damage-reports") loadDamageReports();
  if (sectionId === "employees") loadEmployees();
}


// Show a message (error or success)

function showMessage(text, isError = false) {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.className = "employee-message " + (isError ? "error" : "success");
  messageEl.style.display = "block";
  setTimeout(() => {
    messageEl.style.display = "none";
  }, 5000);
}

// Get storage area value, handling "Other" option

function getStorageArea() {
  const val = storageSelect?.value || "";
  if (val === "Other") {
    return (storageOther?.value || "").trim() || "Other";
  }
  return val;
}

// Event listeners

if (storageSelect && storageOther) {
  storageSelect.addEventListener("change", () => {
    storageOther.style.display = storageSelect.value === "Other" ? "block" : "none";
  });
}

// Handle inventory form submission

if (inventoryForm) {
  inventoryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const barcode = document.getElementById("invBarcode")?.value?.trim();
    const name = document.getElementById("invName")?.value?.trim();
    const category = document.getElementById("invCategory")?.value;
    const qty = document.getElementById("invQty")?.value?.trim();
    const unit = document.getElementById("invUnit")?.value?.trim() || null;
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
        quantity: qty !== "" && qty != null && !isNaN(Number(qty)) ? Number(qty) : null,
        unit: unit || null,
        vendorName: vendorName || null,
        vendorContact: vendorContact || null,
        vendorAddress: vendorAddress || null,
        purchaseDate: purchaseDate || null,
        expiryDate: expiryDate || null,
        storageArea: storageArea || null,
        createdBy: auth.currentUser?.uid || null,
        createdByName: auth.currentUser?.displayName || auth.currentUser?.uid || null,
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

// Handle problem report form submission

if (problemForm) {
  problemForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const barcode = document.getElementById("probBarcode")?.value?.trim();
    const name = document.getElementById("probName")?.value?.trim();
    const qty = document.getElementById("probQty")?.value;
    const unit = document.getElementById("probUnit")?.value || null;
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
        quantity: qty !== "" && qty != null && !isNaN(Number(qty)) ? Number(qty) : null,
        unit: unit || null,
        explanation,
        reportedBy: auth.currentUser?.uid || null,
        reportedByName: auth.currentUser?.displayName || auth.currentUser?.uid || null,
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

// Handle logout

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

let allInventoryItems = [];
let userNameByUid = {};

async function loadUserNameMap() {
  try {
    const snap = await getDocs(collection(db, "users"));
    const map = {};
    snap.forEach((d) => {
      const u = d.data() || {};
      const resolved = u.displayName || u.fullName || u.name || d.id || "Unknown";
    });
    userNameByUid = map;
  } catch (err) {
    console.warn("Failed to load user map:", err);
    userNameByUid = {};
  }
}

function resolveReporterName(nameField, uidField) {
  if (nameField && String(nameField).trim()) return String(nameField).trim();
  if (uidField && userNameByUid[uidField]) return userNameByUid[uidField];
  return "Unknown";
}

function normalizeCategory(value) {
  return String(value || "").trim().toLowerCase();
}

function isProductionInventoryCategory(value) {
  const c = normalizeCategory(value);
  return c === "production" || c === "finished product";
}

function populateCategoryFilter(items) {
  if (!inventoryCategoryFilterEl) return;
  const currentValue = inventoryCategoryFilterEl.value || "";
  const categories = [...new Set(items.map((x) => String(x.category || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  let options = `<option value="">All categories</option>`;
  for (const c of categories) {
    options += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
  }
  inventoryCategoryFilterEl.innerHTML = options;

  if (currentValue && categories.includes(currentValue)) {
    inventoryCategoryFilterEl.value = currentValue;
  }
}

function renderInventoryTable() {
  if (!inventoryListEl) return;
  const selectedCategory = inventoryCategoryFilterEl?.value || "";
  const visibleItems = selectedCategory
    ? allInventoryItems.filter((x) => String(x.category || "").trim() === selectedCategory)
    : allInventoryItems;

  if (visibleItems.length === 0) {
    inventoryListEl.innerHTML = "<p class='empty-msg'>No inventory items for selected category.</p>";
    return;
  }

  let html = `
    <table class="emp-table">
      <thead>
        <tr>
          <th>Barcode/ID</th>
          <th>Name</th>
          <th>Category</th>
          <th>Qty</th>
          <th>Unit</th>
          <th>Vendor</th>
          <th>Vendor contact</th>
          <th>Purchase date</th>
          <th>Expiry date</th>
          <th>Storage area</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const x of visibleItems) {
    const purchaseDate = x.purchaseDate || "—";
    const expiryDate = x.expiryDate || "—";
    const qty = x.quantity != null ? x.quantity : "—";
    const numQty = typeof x.quantity === 'number' && !isNaN(x.quantity) ? x.quantity : (typeof qty === 'number' ? qty : null);
    const rowClass = numQty != null
      ? (numQty < 30 ? 'inv-row-low' : numQty < 60 ? 'inv-row-warning' : 'inv-row-ok')
      : '';
    const unit = x.unit || x.units || "—";
    const hideVendor = isProductionInventoryCategory(x.category);

    html += `
      <tr class="${rowClass}">
        <td>${escapeHtml(x.barcode)}</td>
        <td>${escapeHtml(x.name)}</td>
        <td>${escapeHtml(x.category)}</td>
        <td class="inventory-qty">${escapeHtml(qty)}</td>
        <td>${escapeHtml(unit)}</td>
        <td>${escapeHtml(hideVendor ? "—" : (x.vendorName || "—"))}</td>
        <td>${escapeHtml(hideVendor ? "—" : (x.vendorContact || "—"))}</td>
        <td>${escapeHtml(purchaseDate)}</td>
        <td>${escapeHtml(expiryDate)}</td>
        <td>${escapeHtml(x.storageArea || "—")}</td>
      </tr>
    `;
  }

  html += "</tbody></table>";
  inventoryListEl.innerHTML = html;
}

async function loadInventoryList() {
  if (!inventoryListEl) return;
  inventoryListEl.innerHTML = "<p class='loading-msg'>Loading inventory…</p>";
  try {
    const snap = await getDocs(collection(db, "inventory"));
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));

    allInventoryItems = items;
    populateCategoryFilter(items);

    if (items.length === 0) {
      inventoryListEl.innerHTML = "<p class='empty-msg'>No inventory items yet.</p>";
      return;
    }

    renderInventoryTable();
  } catch (err) {
    inventoryListEl.innerHTML = "<p class='error'>Failed to load inventory: " + escapeHtml(err.message || err) + "</p>";
  }
}

if (inventoryCategoryFilterEl) {
  inventoryCategoryFilterEl.addEventListener("change", () => {
    renderInventoryTable();
  });
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
            <th>Qty</th>
            <th>Unit</th>
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
      const qty = x.quantity != null ? x.quantity : "—";
      const unit = x.unit || x.units || "—";
      html += `
        <tr>
          <td>${escapeHtml(x.barcode)}</td>
          <td>${escapeHtml(x.name)}</td>
          <td>${escapeHtml(qty)}</td>
          <td>${escapeHtml(unit)}</td>
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

// Load inventory products for order dropdown (finished products only)
let inventoryProducts = [];
async function loadInventoryProducts() {
  try {
    const q = query(collection(db, "inventory"));
    const snap = await getDocs(q);
    inventoryProducts = snap.docs
      .map(d => {
        const data = d.data();
        const name = data.name || data.id || 'Product';
        const barcode = data.barcode || data.id || 'N/A';
        if (!data.name && !data.barcode) {
          console.warn(`Inventory doc ${d.id} missing name/barcode for finished product display`);
        }
        return { 
          id: d.id, 
          ...data, 
          display: `${name} (${barcode})`,
          _name: data.name,
          _barcode: data.barcode 
        };
      })
      .filter(p => p.category === "finished product")
      .sort((a, b) => (a._name || a.id).localeCompare(b._name || b.id));
    
    const datalist = document.getElementById("product-list");
    if (datalist) {
      datalist.innerHTML = inventoryProducts.map(p => 
        `<option value="${p.display}" data-barcode="${p._barcode || p.id || ''}" data-name="${p._name || p.id || ''}" data-unit="${p.unit || ''}">`
      ).join('');
    }
    
    if (inventoryProducts.length === 0) {
      console.warn('No finished products found in inventory. Add some with category="finished product".');
    }
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}

// Product search input handler
const orderProductInput = document.getElementById("orderProduct");
if (orderProductInput) {
  orderProductInput.addEventListener("input", (e) => {
    const value = e.target.value;
    const options = document.querySelectorAll("#product-list option");
    
    for (const opt of options) {
      if (opt.value === value) {
        document.getElementById("orderBarcode").value = opt.dataset.barcode || '';
        document.getElementById("orderName").value = opt.dataset.name || value.split(' (')[0] || 'Product';
        document.getElementById("orderUnit").value = opt.dataset.unit || '';
        break;
      }
    }
  });
}

// Load products on page load
loadInventoryProducts();

// Handle order form submission
const orderForm = document.getElementById("orderForm");
if (orderForm) {
  orderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Read form values
    const orderBarcodeEl = document.getElementById("orderBarcode");
    const orderNameEl = document.getElementById("orderName");
    const orderQtyEl = document.getElementById("orderQty");
    const orderUnitEl = document.getElementById("orderUnit");
    const orderNotesEl = document.getElementById("orderNotes");
    const supplierNameEl = document.getElementById("supplierName");
    const supplierContactEl = document.getElementById("supplierContact");
    const supplierAddressEl = document.getElementById("supplierAddress");
    const deliveryDateEl = document.getElementById("deliveryDate");
    
    const barcode = orderBarcodeEl?.value?.trim() || '';
    const productName = orderNameEl?.value?.trim() || '';
    const qty = orderQtyEl?.value?.trim();
    const unit = orderUnitEl?.value?.trim();
    const notes = orderNotesEl?.value?.trim();
    const supplierName = supplierNameEl?.value?.trim();
    const supplierContact = supplierContactEl?.value?.trim();
    const deliveryAddress = supplierAddressEl?.value?.trim();  // supplierAddress → deliveryAddress
    const deliveryDate = deliveryDateEl?.value?.trim();
    
    // Define missing category from finished products context
    const category = 'finished product';
    
    // Validation
    if (!productName || !barcode || !qty || isNaN(Number(qty)) || Number(qty) <= 0 || 
        !unit || !deliveryDate || !supplierName || !supplierContact || !deliveryAddress) {
      showMessage("Please select a product, fill all required fields (Qty, Unit, Supplier details, Delivery date).", true);
      return;
    }

    const submitBtn = orderForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
    }

    try {
      await addDoc(collection(db, "orders"), {
        employeeId: auth.currentUser?.uid,
        employeeName: auth.currentUser?.displayName || auth.currentUser?.email || "Unknown",
        productBarcode: barcode,
        productName,
        category,
        quantity: Number(qty),
        unit,
        notes: notes || null,
        supplierName,
        supplierContact,
        supplierAddress: supplierName || null,  // Keep original supplierAddress field
        deliveryAddress,
        status: "pending",
        deliveryDate,
        createdAt: serverTimestamp()
      });
      showMessage("✅ Order submitted successfully! Manager will review.");
      orderForm.reset();
      // Clear hidden fields
      if (orderBarcodeEl) orderBarcodeEl.value = '';
      if (orderNameEl) orderNameEl.value = '';
    } catch (err) {
      console.error("Order submit error:", err);
      showMessage("❌ Failed to submit order: " + (err.message || err), true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Order";
      }
    }
  });
}

// Nav: switch section
loadUserNameMap();

document.querySelectorAll(".employee-nav-link").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const section = a.getAttribute("data-section");
    if (section) showPanel(section);
  });
});
