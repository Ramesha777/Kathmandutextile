// punch.js — Barcode punch kiosk: In/Out, 5-min cooldown, daily reset
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COOLDOWN_MINUTES = 5;
const COLLECTION_EMPLOYEES = "employees";
const COLLECTION_PUNCHES = "punchRecords";

let employeesCache = [];
let lastPunchTime = 0;
let scannerResetTimer = null;
let processingEmployeeId = null; // prevents race when same employee punches twice quickly

const RESET_SCANNER_DELAY_MS = 5000;
const DEFAULT_MESSAGE = "Scan your barcode to punch";

const timeEl = document.getElementById("punch-time");
const messageEl = document.getElementById("punch-message");
const barcodeInput = document.getElementById("punch-barcode-input");

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(date) {
  const d = date || new Date();
  const hours = d.getHours();
  const mins = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")} ${ampm}`;
}

function updateClock() {
  if (timeEl) timeEl.textContent = formatTime();
}

function showMessage(text, isError = false) {
  if (messageEl) {
    messageEl.textContent = text;
    messageEl.classList.toggle("error", isError);
  }
}

function showTickMark(show) {
  const tickEl = document.getElementById("punch-tick");
  if (!tickEl) return;
  tickEl.classList.toggle("show", !!show);
}

function scheduleScannerReset() {
  if (scannerResetTimer) clearTimeout(scannerResetTimer);
  scannerResetTimer = setTimeout(() => {
    showMessage(DEFAULT_MESSAGE, false);
    showTickMark(false);
    if (barcodeInput) {
      barcodeInput.value = "";
      barcodeInput.focus();
    }
    scannerResetTimer = null;
  }, RESET_SCANNER_DELAY_MS);
}

function findEmployeeByBarcode(barcode) {
  const val = String(barcode || "").trim();
  if (!val) return null;
  return (
    employeesCache.find((e) => e.id === val) ||
    employeesCache.find((e) => (e.barcode || "").toString().trim() === val)
  ) || null;
}

async function loadEmployees() {
  try {
    const snap = await getDocs(collection(db, COLLECTION_EMPLOYEES));
    employeesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Failed to load employees:", err);
  }
}

async function getTodayPunchesForEmployee(employeeId) {
  const today = getTodayStr();
  try {
    const q = query(
      collection(db, COLLECTION_PUNCHES),
      where("employeeId", "==", employeeId),
      where("date", "==", today)
    );
    const snap = await getDocs(q);
    const punches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    punches.sort((a, b) => {
      const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
      const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
      return tb - ta;
    });
    return punches;
  } catch (err) {
    console.error("Failed to get punches:", err);
    return [];
  }
}

// Alternates In/Out: if last punch was In (in building), next is Out (out of building), and vice versa
function getNextPunchType(todayPunches) {
  if (!todayPunches || todayPunches.length === 0) return "in";
  const last = todayPunches[0];
  return (last.type || "in").toLowerCase() === "in" ? "out" : "in";
}

function parsePunchTimestamp(punch) {
  const ts = punch?.timestamp;
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds != null) return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

async function processPunch(barcode) {
  const emp = findEmployeeByBarcode(barcode);
  if (!emp) {
    showTickMark(false);
    showMessage("Employee not found. Please check your barcode.", true);
    scheduleScannerReset();
    return { success: false, message: "Employee not found. Please check your ID.", isError: true };
  }

  const employeeId = emp.id;

  // Prevent same employee from punching twice before first request completes (race fix)
  if (processingEmployeeId === employeeId) {
    showTickMark(false);
    showMessage("Please wait, processing...", true);
    scheduleScannerReset();
    return { success: false, message: "Please wait, processing...", isError: true };
  }
  processingEmployeeId = employeeId;
  const employeeName = emp.fullName || emp.name || emp.email || emp.id;
  const now = new Date();
  const today = getTodayStr();

  const todayPunches = await getTodayPunchesForEmployee(employeeId);
  const nextType = getNextPunchType(todayPunches);

  // 5-minute cooldown: if same employee scans again within 5 min, do not record; show message
  if (todayPunches.length > 0) {
    const lastPunch = todayPunches[0];
    const lastTs = parsePunchTimestamp(lastPunch);
    if (!lastTs) {
      processingEmployeeId = null;
      showTickMark(false);
      showMessage("Unable to read last punch time. Please try again.", true);
      scheduleScannerReset();
      return { success: false, message: "Unable to read last punch time.", isError: true };
    }
    const diffMs = now.getTime() - lastTs.getTime();
    const diffMinutes = diffMs / (60 * 1000);
    if (diffMinutes < COOLDOWN_MINUTES) {
      processingEmployeeId = null;
      showTickMark(false);
      showMessage("Too soon. Punch not recorded. Try again after 5 minutes.", true);
      scheduleScannerReset();
      return { success: false, message: "Too soon. Punch not recorded. Try again after 5 minutes.", isError: true };
    }
  }

  try {
    await addDoc(collection(db, COLLECTION_PUNCHES), {
      employeeId,
      employeeName,
      type: nextType,
      date: today,
      timestamp: now,
    });

    const typeLabel = nextType === "in" ? "Employee is in the building" : "Employee is out of the building";
    const msg = `Punch of ${employeeName} accepted. ${typeLabel}`;
    showMessage(msg, false);
    showTickMark(true);
    lastPunchTime = Date.now();
    scheduleScannerReset();
    return { success: true, message: msg, isError: false };
  } catch (err) {
    console.error("Punch failed:", err);
    showTickMark(false);
    showMessage("Failed to record punch. Please try again.", true);
    scheduleScannerReset();
    return { success: false, message: "Failed to record punch. Please try again.", isError: true };
  } finally {
    processingEmployeeId = null;
  }
}

function onBarcodeSubmit(e) {
  e.preventDefault();
  const val = barcodeInput?.value?.trim();
  if (!val) return;
  barcodeInput.value = "";
  processPunch(val);
}

function init() {
  updateClock();
  setInterval(updateClock, 1000);

  loadEmployees();
  setInterval(loadEmployees, 60 * 1000);

  if (barcodeInput) {
    barcodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onBarcodeSubmit(e);
      }
    });
    barcodeInput.addEventListener("input", () => {
      if (barcodeInput.value && barcodeInput.value.length > 3 && !barcodeInput.dataset.listening) {
        barcodeInput.dataset.listening = "1";
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#punch-modal-overlay") && !e.target.closest("#punch-manual-btn"))
      barcodeInput?.focus();
  });
  barcodeInput?.focus();

  const manualBtn = document.getElementById("punch-manual-btn");
  const modalOverlay = document.getElementById("punch-modal-overlay");
  const manualIdInput = document.getElementById("punch-manual-id");
  const modalCancel = document.getElementById("punch-modal-cancel");
  const modalPunch = document.getElementById("punch-modal-punch");

  if (manualBtn && modalOverlay) {
    const modalResultEl = document.getElementById("punch-modal-result");
    manualBtn.addEventListener("click", () => {
      modalOverlay.classList.add("show");
      if (manualIdInput) {
        manualIdInput.value = "";
        manualIdInput.focus();
      }
      if (modalResultEl) {
        modalResultEl.textContent = "";
        modalResultEl.classList.remove("success", "error");
      }
    });
  }

  if (modalCancel && modalOverlay) {
    modalCancel.addEventListener("click", () => {
      modalOverlay.classList.remove("show");
      barcodeInput?.focus();
    });
  }

  if (modalPunch && modalOverlay && manualIdInput) {
    const modalResult = document.getElementById("punch-modal-result");
    const doManualPunch = async () => {
      const val = manualIdInput.value.trim();
      if (!val) return;
      modalPunch.disabled = true;
      if (modalResult) {
        modalResult.textContent = "Processing...";
        modalResult.classList.remove("success", "error");
      }
      const result = await processPunch(val);
      if (modalResult && result) {
        modalResult.textContent = result.message;
        modalResult.classList.add(result.isError ? "error" : "success");
      }
      manualIdInput.value = "";
      modalPunch.disabled = false;
      setTimeout(() => {
        modalOverlay.classList.remove("show");
        if (modalResult) modalResult.textContent = "";
        barcodeInput?.focus();
      }, 1500);
    };
    modalPunch.addEventListener("click", doManualPunch);
    manualIdInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doManualPunch();
      }
    });
  }
}

init();
