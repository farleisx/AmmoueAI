// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

/* ================= FIREBASE CONFIG ================= */

const firebaseConfig = {
  apiKey: "AIzaSyAmnZ69YDcEFcmuXIhmGxDUSPULxpI-Bmg",
  authDomain: "ammoueai.firebaseapp.com",
  projectId: "ammoueai",
  storageBucket: "ammoueai.firebasestorage.app",
  messagingSenderId: "135818868149",
  appId: "1:135818868149:web:db9280baf9540a3339d5fc",
};

const app = initializeApp(firebaseConfig);

/* ================= SERVICES ================= */

export const auth = getAuth(app);
export const db = getFirestore(app);

/* ================= PROVIDERS ================= */

const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

/* ================= USER TRACKING ================= */

async function trackUserLogin(user, providerName) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    // First login
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,

      plan: "free",
      provider: providerName,

      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      loginCount: 1,

      banned: false,
    });
  } else {
    // Returning user
    await updateDoc(userRef, {
      lastLoginAt: serverTimestamp(),
      loginCount: (snap.data().loginCount || 0) + 1,
    });
  }
}

/* ================= LOGIN HELPERS ================= */

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  await trackUserLogin(result.user, "google");
  return result.user;
}

export async function loginWithGitHub() {
  const result = await signInWithPopup(auth, githubProvider);
  await trackUserLogin(result.user, "github");
  return result.user;
}
