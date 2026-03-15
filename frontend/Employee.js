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
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const MAX_DAMAGE_IMAGES = 5;
const MAX_IMAGE_SIZE_MB = 5;


// DOM elements

const messageEl = document.getElementById("employeeMessage");
const inventoryForm = document.getElementById("inventoryForm");
const problemForm = document.getElementById("problemForm");
const storageSelect = document.getElementById("invStorageArea");
const storageOther = document.getElementById("invStorageOther");
const logoutBtn = document.getElementById("btnSignOut");
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

// Logout
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.replace("login.html");
    } catch (err) {
      console.error("Logout failed", err);
      showMessage("Logout failed. Please try again.", true);
    }
  });
}

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

let damageReportCapturedBlobs = [];

async function uploadDamageImages(filesOrBlobs) {
  const imageUrls = [];
  const uid = auth.currentUser?.uid || "anon";
  const prefix = `problem_report_images/${uid}_${Date.now()}`;
  const items = Array.from(filesOrBlobs || []).slice(0, MAX_DAMAGE_IMAGES);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) continue;
    const ext = item.name ? (item.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "jpg") : "jpg";
    const path = `${prefix}_${i}.${ext}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, item);
    const url = await getDownloadURL(storageRef);
    imageUrls.push(url);
  }
  return imageUrls;
}

function renderDamageImagePreviews() {
  const container = document.getElementById("probImagePreviews");
  const imagesInput = document.getElementById("probImages");
  if (!container) return;
  const files = Array.from(imagesInput?.files || []);
  const items = [...files, ...damageReportCapturedBlobs].slice(0, MAX_DAMAGE_IMAGES);
  const fileCount = files.length;
  container.innerHTML = items.map((item, i) => {
    const url = item instanceof File || item instanceof Blob ? URL.createObjectURL(item) : null;
    const isCaptured = i >= fileCount;
    return url ? `<div style="position:relative;"><img src="${url}" alt="Preview ${i + 1}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,0.2);"><button type="button" class="btn-remove-preview" data-index="${i}" data-captured="${isCaptured ? "1" : "0"}" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;padding:0;border-radius:50%;background:#ef4444;color:#fff;border:none;cursor:pointer;font-size:14px;line-height:1;">×</button></div>` : "";
  }).join("");
  container.querySelectorAll(".btn-remove-preview").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      const isCaptured = btn.dataset.captured === "1";
      if (isCaptured) {
        damageReportCapturedBlobs.splice(idx - fileCount, 1);
      } else {
        const dt = new DataTransfer();
        for (let j = 0; j < fileCount; j++) if (j !== idx) dt.items.add(imagesInput.files[j]);
        if (imagesInput) imagesInput.files = dt.files;
      }
      renderDamageImagePreviews();
    });
  });
}

function setupCameraCapture() {
  const takePhotoBtn = document.getElementById("probTakePhoto");
  const cameraModal = document.getElementById("cameraModal");
  const cameraVideo = document.getElementById("cameraVideo");
  const captureBtn = document.getElementById("cameraCaptureBtn");
  const cancelBtn = document.getElementById("cameraCancelBtn");
  let stream = null;

  async function openCamera() {
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false
        });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      cameraVideo.srcObject = stream;
      cameraModal.style.display = "flex";
    } catch (err) {
      showMessage("Could not access camera: " + (err.message || err), true);
    }
  }

  function closeCamera() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    cameraVideo.srcObject = null;
    cameraModal.style.display = "none";
  }

  function capturePhoto() {
    if (damageReportCapturedBlobs.length + (document.getElementById("probImages")?.files?.length || 0) >= MAX_DAMAGE_IMAGES) {
      showMessage(`Maximum ${MAX_DAMAGE_IMAGES} images allowed.`, true);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = cameraVideo.videoWidth;
    canvas.height = cameraVideo.videoHeight;
    canvas.getContext("2d").drawImage(cameraVideo, 0, 0);
    canvas.toBlob(blob => {
      if (blob) {
        damageReportCapturedBlobs.push(blob);
        renderDamageImagePreviews();
      }
      closeCamera();
    }, "image/jpeg", 0.85);
  }

  if (takePhotoBtn) takePhotoBtn.addEventListener("click", openCamera);
  if (captureBtn) captureBtn.addEventListener("click", capturePhoto);
  if (cancelBtn) cancelBtn.addEventListener("click", closeCamera);
}

if (document.getElementById("probImages")) {
  document.getElementById("probImages").addEventListener("change", renderDamageImagePreviews);
  setupCameraCapture();
}

if (problemForm) {
  problemForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const barcode = document.getElementById("probBarcode")?.value?.trim();
    const name = document.getElementById("probName")?.value?.trim();
    const qty = document.getElementById("probQty")?.value;
    const unit = document.getElementById("probUnit")?.value || null;
    const explanation = document.getElementById("probExplanation")?.value?.trim();
    const imagesInput = document.getElementById("probImages");

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
      const allImages = [...Array.from(imagesInput?.files || []), ...damageReportCapturedBlobs];
      const imageUrls = allImages.length ? await uploadDamageImages(allImages) : [];
      damageReportCapturedBlobs = [];
      renderDamageImagePreviews();
      await addDoc(collection(db, "problem_reports"), {
        barcode,
        name,
        quantity: qty !== "" && qty != null && !isNaN(Number(qty)) ? Number(qty) : null,
        unit: unit || null,
        explanation,
        imageUrls: imageUrls.length ? imageUrls : null,
        reportedBy: auth.currentUser?.uid || null,
        reportedByName: auth.currentUser?.displayName || auth.currentUser?.uid || null,
        reportedAt: serverTimestamp()
      });
      showMessage("Problem report submitted successfully.");
      problemForm.reset();
      if (imagesInput) imagesInput.value = "";
      damageReportCapturedBlobs = [];
      renderDamageImagePreviews();
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

// Logout handled by dashboard-header.js


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
            <th>Images</th>
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
      const urls = Array.isArray(x.imageUrls) ? x.imageUrls : [];
      const imagesHtml = urls.length
        ? urls.map((u, i) => `<a href="${u}" target="_blank" rel="noopener" title="View image ${i + 1}"><img src="${u}" alt="Damage ${i + 1}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.1);margin-right:4px;vertical-align:middle;"></a>`).join("")
        : "—";
      html += `
        <tr>
          <td>${escapeHtml(x.barcode)}</td>
          <td>${escapeHtml(x.name)}</td>
          <td>${escapeHtml(qty)}</td>
          <td>${escapeHtml(unit)}</td>
          <td>${escapeHtml(x.explanation)}</td>
          <td>${imagesHtml}</td>
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

// ─── Multi-product order system ───

let orderRowCounter = 0;

// Bind product search on any row (delegation)
function bindProductSearchForRow(row) {
  const searchInput = row.querySelector('.order-row-product-search');
  if (!searchInput) return;
  searchInput.addEventListener('input', () => {
    const value = searchInput.value;
    const options = document.querySelectorAll('#product-list option');
    for (const opt of options) {
      if (opt.value === value) {
        row.querySelector('.order-row-barcode').value = opt.dataset.barcode || '';
        row.querySelector('.order-row-name').value = opt.dataset.name || value.split(' (')[0] || 'Product';
        const unitSelect = row.querySelector('.order-row-unit');
        if (opt.dataset.unit && unitSelect) {
          unitSelect.value = opt.dataset.unit;
        }
        break;
      }
    }
  });
}

function createProductRow(index) {
  const row = document.createElement('div');
  row.className = 'order-product-row';
  row.dataset.row = index;
  row.innerHTML = `
    <div class="order-product-row-header">
      <span class="order-product-row-num">Product #${index + 1}</span>
      <button type="button" class="btn-remove-product-row" title="Remove this product">✕</button>
    </div>
    <div class="order-product-row-fields">
      <div class="form-group order-product-search-group">
        <label>Product (Search from Inventory)</label>
        <input type="text" class="order-row-product-search" list="product-list" placeholder="Start typing product name or barcode..." required>
        <input type="hidden" class="order-row-barcode">
        <input type="hidden" class="order-row-name">
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Quantity</label>
          <input type="number" class="order-row-qty" min="1" step="0.01" required>
        </div>
        <div class="form-group">
          <label>Unit</label>
          <select class="order-row-unit" required>
            <option value="">Select unit</option>
            <option value="kg">kg</option>
            <option value="ltr">ltr</option>
            <option value="meter">meter</option>
            <option value="piece">piece</option>
            <option value="roll">Koiree</option>
          </select>
        </div>
      </div>
    </div>
  `;
  bindProductSearchForRow(row);
  return row;
}

function updateOrderProductCount() {
  const count = document.querySelectorAll('#order-products-container .order-product-row').length;
  const countEl = document.getElementById('order-product-count');
  if (countEl) countEl.textContent = count;
}

function renumberProductRows() {
  const rows = document.querySelectorAll('#order-products-container .order-product-row');
  rows.forEach((row, i) => {
    const numEl = row.querySelector('.order-product-row-num');
    if (numEl) numEl.textContent = `Product #${i + 1}`;
    row.dataset.row = i;
  });
}

function updateRemoveButtons() {
  const rows = document.querySelectorAll('#order-products-container .order-product-row');
  rows.forEach(row => {
    const btn = row.querySelector('.btn-remove-product-row');
    if (!btn) return;
    if (rows.length <= 1) {
      btn.disabled = true;
    } else {
      btn.disabled = false;
    }
  });
}

// Initialize multi-product order UI
function initMultiProductOrder() {
  const container = document.getElementById('order-products-container');
  const addBtn = document.getElementById('btn-add-product-row');

  if (!container || !addBtn) return;

  // Bind search for the first existing row
  const firstRow = container.querySelector('.order-product-row');
  if (firstRow) bindProductSearchForRow(firstRow);

  // ➕ Add Product button
  addBtn.addEventListener('click', () => {
    orderRowCounter++;
    const row = createProductRow(container.querySelectorAll('.order-product-row').length);
    container.appendChild(row);
    updateOrderProductCount();
    updateRemoveButtons();
    // Focus the new row's search input
    row.querySelector('.order-row-product-search')?.focus();
    // Scroll the row into view
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // ✕ Remove button (delegated)
  container.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.btn-remove-product-row');
    if (!removeBtn || removeBtn.disabled) return;

    const row = removeBtn.closest('.order-product-row');
    row.classList.add('removing');
    setTimeout(() => {
      row.remove();
      renumberProductRows();
      updateOrderProductCount();
      updateRemoveButtons();
    }, 300);
  });
}

// Collect all product rows into an array
function collectOrderProducts() {
  const rows = document.querySelectorAll('#order-products-container .order-product-row');
  const products = [];

  for (const row of rows) {
    const searchVal = row.querySelector('.order-row-product-search')?.value?.trim() || '';
    const barcode = row.querySelector('.order-row-barcode')?.value?.trim() || '';
    const name = row.querySelector('.order-row-name')?.value?.trim() || searchVal.split(' (')[0] || '';
    const qty = row.querySelector('.order-row-qty')?.value?.trim();
    const unit = row.querySelector('.order-row-unit')?.value?.trim();

    if (!name || !barcode) {
      row.querySelector('.order-row-product-search')?.focus();
      return { error: `Please select a valid product from inventory for Product #${products.length + 1}.` };
    }
    if (!qty || isNaN(Number(qty)) || Number(qty) <= 0) {
      row.querySelector('.order-row-qty')?.focus();
      return { error: `Please enter a valid quantity for "${name}".` };
    }
    if (!unit) {
      row.querySelector('.order-row-unit')?.focus();
      return { error: `Please select a unit for "${name}".` };
    }

    products.push({
      productBarcode: barcode,
      productName: name,
      category: 'finished product',
      quantity: Number(qty),
      unit
    });
  }

  if (products.length === 0) {
    return { error: 'Please add at least one product.' };
  }

  return { products };
}

function resetOrderForm() {
  const form = document.getElementById('orderForm');
  if (form) form.reset();

  const container = document.getElementById('order-products-container');
  if (container) {
    // Remove all rows, re-create one fresh row
    container.innerHTML = '';
    orderRowCounter = 0;
    const row = createProductRow(0);
    const removeBtn = row.querySelector('.btn-remove-product-row');
    if (removeBtn) removeBtn.disabled = true;
    container.appendChild(row);
  }
  updateOrderProductCount();
}

// Load products on page load
loadInventoryProducts();

// Init multi-product UI
initMultiProductOrder();

// Handle order form submission (multi-product)
const orderForm = document.getElementById("orderForm");
if (orderForm) {
  orderForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Supplier details
    const supplierName = document.getElementById("supplierName")?.value?.trim();
    const supplierContact = document.getElementById("supplierContact")?.value?.trim();
    const supplierAddress = document.getElementById("supplierAddress")?.value?.trim();
    const deliveryDate = document.getElementById("deliveryDate")?.value?.trim();
    const notes = document.getElementById("orderNotes")?.value?.trim();

    if (!supplierName || !supplierContact || !supplierAddress || !deliveryDate) {
      showMessage("Please fill all supplier details and delivery date.", true);
      return;
    }

    // Collect products
    const result = collectOrderProducts();
    if (result.error) {
      showMessage(result.error, true);
      return;
    }

    const { products } = result;
    const submitBtn = orderForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
    }

    try {
      await addDoc(collection(db, "orders"), {
        employeeId: auth.currentUser?.uid,
        employeeName: auth.currentUser?.displayName || auth.currentUser?.email || "Unknown",
        // Store products as array for multi-product support
        products,
        productCount: products.length,
        // Also keep top-level fields for backward compatibility (first product)
        productBarcode: products[0].productBarcode,
        productName: products[0].productName,
        category: products[0].category,
        quantity: products[0].quantity,
        unit: products[0].unit,
        // Supplier & delivery
        supplierName,
        supplierContact,
        supplierAddress,
        deliveryAddress: supplierAddress,
        deliveryDate,
        notes: notes || null,
        status: "pending",
        createdAt: serverTimestamp()
      });

      const productCountText = products.length === 1
        ? `1 product`
        : `${products.length} products`;
      showMessage(`✅ Order submitted with ${productCountText}! Manager will review.`);
      resetOrderForm();
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
