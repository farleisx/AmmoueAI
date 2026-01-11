// fire_prompt.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
  increment,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

/* ================= FIREBASE CONFIG ================= */

export const firebaseConfig = {
  apiKey: "AIzaSyAmnZ69YDcEFcmuXIhmGxDUSPULxpI-Bmg",
  authDomain: "ammoueai.firebaseapp.com",
  projectId: "ammoueai",
  storageBucket: "ammoueai.firebasestorage.app",
  messagingSenderId: "135818868149",
  appId: "1:135818868149:web:db9280baf9540a3339d5fc"
};

/* ================= INIT ================= */

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Used in Firestore path: artifacts/{appId}/users/{uid}/projects
export const appId = firebaseConfig.projectId;

/* ================= USER PLAN ================= */

export async function getUserPlan(userId) {
  try {
    const userDocRef = doc(db, "users", userId);
    const snap = await getDoc(userDocRef);
    return snap.exists() ? snap.data().plan || "free" : "free";
  } catch (e) {
    console.error("Failed to fetch user plan:", e);
    return "free";
  }
}

/* ================= PROJECT AUTOSAVE ================= */

export async function autoSaveProject(
  htmlContent,
  userPrompt,
  existingProjectId,
  currentUserId
) {
  if (!currentUserId || !htmlContent) return null;

  try {
    const projectsRef = collection(
      db,
      "artifacts",
      appId,
      "users",
      currentUserId,
      "projects"
    );

    if (existingProjectId) {
      const docRef = doc(projectsRef, existingProjectId);
      await updateDoc(docRef, {
        prompt: userPrompt.replace(/\\n/g, "\n"),
        htmlContent,
        updatedAt: serverTimestamp()
      });
      return existingProjectId;
    } else {
      const newDocRef = await addDoc(projectsRef, {
        prompt: userPrompt.replace(/\\n/g, "\n"),
        htmlContent,
        deploymentUrl: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return newDocRef.id;
    }
  } catch (e) {
    console.error("Auto-save failed:", e);
    return null;
  }
}

/* ================= LOAD ALL PROJECTS ================= */

export async function getUserProjects(userId) {
  if (!userId) return [];

  try {
    const projectsRef = collection(
      db,
      "artifacts",
      appId,
      "users",
      userId,
      "projects"
    );

    const q = query(projectsRef, orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);

    return snap.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  } catch (e) {
    console.error("Failed to load user projects:", e);
    return [];
  }
}

/* ================= DEPLOYMENT URL UPDATE ================= */

export async function updateProjectDeploymentUrl(
  projectId,
  deploymentUrl,
  currentUserId
) {
  if (!currentUserId || !projectId) return;

  try {
    const projectRef = doc(
      db,
      "artifacts",
      appId,
      "users",
      currentUserId,
      "projects",
      projectId
    );

    await updateDoc(projectRef, {
      deploymentUrl,
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    console.error("Failed to update deployment URL:", e);
  }
}

/* ================= USAGE COUNTERS ================= */

export async function incrementCounter(userId, field) {
  try {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      [field]: increment(1)
    });
  } catch (e) {
    console.error(`Failed to increment ${field}:`, e);
  }
}
