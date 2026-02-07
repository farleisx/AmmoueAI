// firedashboard.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  deleteDoc,
  doc,
  Timestamp,
  updateDoc,
  getDoc,
  writeBatch // Added this
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

/* ... config same as before ... */
const firebaseConfig = {
  apiKey: "AIzaSyAmnZ69YDcEFcmuXIhmGxDUSPULxpI-Bmg",
  authDomain: "ammoueai.firebaseapp.com",
  projectId: "ammoueai",
  storageBucket: "ammoueai.firebasestorage.app",
  messagingSenderId: "135818868149",
  appId: "1:135818868149:web:db9280baf9540a3339d5fc",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = firebaseConfig.projectId;

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function logout() {
  await signOut(auth);
}

export {
  collection,
  onSnapshot,
  query,
  deleteDoc,
  doc,
  Timestamp,
  updateDoc,
  getDoc,
  writeBatch // Added this
};
