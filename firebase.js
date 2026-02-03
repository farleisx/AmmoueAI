// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, GithubAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyAmnZ69YDcEFcmuXIhmGxDUSPULxpI-Bmg",
    authDomain: "ammoueai.firebaseapp.com",
    projectId: "ammoueai",
    storageBucket: "ammoueai.firebasestorage.app",
    messagingSenderId: "135818868149",
    appId: "1:135818868149:web:db9280baf9540a3339d5fc",
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// --- Providers ---
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
githubProvider.addScope('repo');

// --- Auth State ---
export function onAuthChange(callback) {
    onAuthStateChanged(auth, callback);
}
