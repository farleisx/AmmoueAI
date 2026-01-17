// firefile.js

/* ================= FIREBASE CONFIG ================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAmnZ69YDcEFcmuXIhmGxDUSPULxpI-Bmg",
  authDomain: "ammoueai.firebaseapp.com",
  projectId: "ammoueai"
};

/* ================= INIT ================= */

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = firebaseConfig.projectId;

/* ================= PLAN CONFIG ================= */

export const PLANS = {
  free: {
    name: "FREE",
    color: "text-ammoue",
    description: "Limited usage on Free plan",
    showUpgrade: true
  },

  pro: {
    name: "PRO",
    color: "text-yellow-600",
    description:
      "5 separate deployments, 5 refinement requests, and Agent 2 access.",
    showUpgrade: false
  }
};
