// fireupgrade.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

/* ===============================
   FIREBASE CLIENT CONFIG (SAFE)
   =============================== */
const firebaseConfig = {
  apiKey: "AIzaSyAmnZ69YDcEFcmuXIhmGxDUSPULxpI-Bmg",
  authDomain: "ammoueai.firebaseapp.com",
  projectId: "ammoueai",
  storageBucket: "ammoueai.firebasestorage.app",
  messagingSenderId: "135818868149",
  appId: "1:135818868149:web:db9280baf9540a3339d5fc",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/* ===============================
   STATE
   =============================== */
let currentUser = null;
const statusMessage = document.getElementById("status-message");

/* ===============================
   AUTH STATE
   =============================== */
onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (!user) {
    statusMessage.textContent = "⚠ Please log in to upgrade.";
  }
});

/* ===============================
   PAYPAL BUTTONS
   =============================== */
paypal.Buttons({

  async createOrder() {
    if (!currentUser) {
      statusMessage.textContent = "⚠ You must log in first.";
      return;
    }

    statusMessage.textContent = "Creating PayPal order…";

    const res = await fetch("/api/paypal-order", {
      method: "POST",
    });

    const data = await res.json();
    return data.orderID;
  },

  async onApprove(data) {
    if (!currentUser) {
      statusMessage.textContent = "⚠ You must log in first.";
      return;
    }

    statusMessage.textContent = "Finalizing upgrade…";

    // 🔐 Send Firebase ID token to backend
    const token = await currentUser.getIdToken();

    const res = await fetch(`/api/paypal-capture?orderID=${data.orderID}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    const result = await res.json();

    if (!res.ok) {
      statusMessage.textContent = result.error || "Upgrade failed.";
      return;
    }

    statusMessage.textContent = "Success! Redirecting… 🚀";
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1200);
  },

  onError(err) {
    console.error(err);
    statusMessage.textContent = "Something went wrong. Try again.";
  },

}).render("#paypal-button-container");
