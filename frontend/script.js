// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM elements
const loginForm  = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passInput  = document.getElementById('password');
const errorMsg   = document.getElementById('errorMsg');
const loginBtn   = document.getElementById('loginBtn');
const googleBtn  = document.getElementById('googleBtn');

// Show message from URL (e.g. after admin creates user: login.html?msg=User+created.+Please+sign+in+again.)
const urlParams = new URLSearchParams(window.location.search);
const msg = urlParams.get('msg');
if (msg && errorMsg) {
  errorMsg.style.color = '#065f46';
  errorMsg.style.background = '#d1fae5';
  errorMsg.style.padding = '0.75rem';
  errorMsg.style.borderRadius = '8px';
  errorMsg.textContent = decodeURIComponent(msg.replace(/\+/g, ' '));
  errorMsg.style.display = 'block';
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.style.display = 'block';
}

function clearError() {
  errorMsg.textContent = '';
  errorMsg.style.display = 'none';
  errorMsg.style.color = '';
  errorMsg.style.background = '';
  errorMsg.style.padding = '';
  errorMsg.style.borderRadius = '';
}

/**
 * Fetch user role from Firestore (users collection, document id = uid).
 * Returns role string: "admin" | "employee" | "Manager" or null if not found.
 */
async function getUserRole(uid) {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return null;
  const data = userSnap.data();
  return data.role || null;
}

/**
 * Redirect user to the page corresponding to their role.
 */
function redirectByRole(role) {
  const r = (role || '').trim();
  if (r === 'admin') {
    window.location.href = 'admin.html';
    return;
  }
  if (r === 'employee') {
    window.location.href = 'employee.html';
    return;
  }
  if (r === 'Manager') {
    window.location.href = 'manager.html';
    return;
  }
  showError('No valid role assigned. Contact administrator.');
}

async function handleLoginSuccess(user) {
  const role = await getUserRole(user.uid);
  if (role) {
    redirectByRole(role);
  } else {
    showError('User profile not found in database. Contact administrator.');
  }
}

// Email + Password login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const email = emailInput.value.trim();
  const password = passInput.value;

  loginBtn.textContent = "Signing in...";
  loginBtn.classList.add('loading');

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    await handleLoginSuccess(userCredential.user);
  } catch (error) {
    let msg = "Login failed. Please try again.";
    switch (error.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        msg = "Invalid email or password.";
        break;
      case 'auth/user-not-found':
        msg = "No account found with this email.";
        break;
      case 'auth/too-many-requests':
        msg = "Too many attempts. Try again later.";
        break;
      default:
        msg = error.message;
    }
    showError(msg);
  } finally {
    loginBtn.textContent = "Sign In";
    loginBtn.classList.remove('loading');
  }
});

// Google Sign-In (only if button exists)
if (googleBtn) {
  googleBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    googleBtn.textContent = "Connecting...";
    googleBtn.classList.add('loading');
    clearError();
    try {
      const result = await signInWithPopup(auth, provider);
      await handleLoginSuccess(result.user);
    } catch (error) {
      showError(error.message || "Google sign-in failed");
    } finally {
      googleBtn.textContent = "Continue with Google";
      googleBtn.classList.remove('loading');
    }
  });
}

// Add this function where manager confirms an order
async function confirmOrder(orderId) {
  const { doc, getDoc, updateDoc, increment } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  
  // 1. Get the order details
  const orderRef = doc(db, "orders", orderId);
  const orderSnap = await getDoc(orderRef);
  
  if (!orderSnap.exists()) {
    alert("Order not found!");
    return;
  }

  const orderData = orderSnap.data();

  // 2. Update order status to confirmed
  await updateDoc(orderRef, { status: "confirmed", confirmedAt: new Date() });

  // 3. Reduce finished product inventory for each item in the order
  for (const item of orderData.items) {
    const productRef = doc(db, "finishedProducts", item.productId);
    const productSnap = await getDoc(productRef);

    if (productSnap.exists()) {
      const currentQty = productSnap.data().quantity || 0;
      const newQty = currentQty - item.quantity;

      if (newQty < 0) {
        alert(`Insufficient stock for ${item.productName}. Available: ${currentQty}, Requested: ${item.quantity}`);
        // Optionally revert order status
        await updateDoc(orderRef, { status: "pending" });
        return;
      }

      await updateDoc(productRef, {
        quantity: increment(-item.quantity),
        lastUpdated: new Date()
      });
    }
  }

  alert("Order confirmed and inventory updated!");
}