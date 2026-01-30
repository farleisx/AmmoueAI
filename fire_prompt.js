import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  getDocs,
  query,
  orderBy,
  setDoc
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
  allPages, // Updated to accept the projectPages object
  userPrompt,
  existingProjectId,
  currentUserId,
  actionLogs = "",
  activePageName = "landing", // New: tracks the current view
  projectName = "Untitled Project" // Added to sync naming
) {
  if (!currentUserId || !allPages) return null;

  try {
    const projectsRef = collection(
      db,
      "artifacts",
      appId,
      "users",
      currentUserId,
      "projects"
    );

    // Prepare data including the full pages map
    const projectData = {
      prompt: userPrompt.replace(/\\n/g, "\n"),
      htmlContent: allPages[activePageName] || "", // Primary page for compatibility
      pages: allPages,                             // The map of all generated pages
      actionLogs,
      projectName,
      updatedAt: serverTimestamp()
    };

    if (existingProjectId) {
      const docRef = doc(projectsRef, existingProjectId);
      await updateDoc(docRef, projectData);
      return existingProjectId;
    } else {
      const newDocRef = await addDoc(projectsRef, {
        ...projectData,
        deploymentUrl: null,
        createdAt: serverTimestamp(),
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
    // Use setDoc with merge to ensure user document exists
    await setDoc(userRef, {
      [field]: increment(1),
      lastActive: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.error(`Failed to increment ${field}:`, e);
  }
}

export async function getUsage(userId) {
  try {
    const ref = doc(db, "users", userId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data();
    }
    return { dailyCount: 0, plan: "free", dailyResetAt: 0 };
  } catch (e) {
    console.error("Failed to fetch usage:", e);
    return { dailyCount: 0, plan: "free", dailyResetAt: 0 };
  }
}

/* ================= DELETE PROJECT ================= */

export async function deleteProject(projectId, userId) {
  if (!userId || !projectId) return;
  try {
    const projectRef = doc(
      db,
      "artifacts",
      appId,
      "users",
      userId,
      "projects",
      projectId
    );
    await deleteDoc(projectRef);
    return true;
  } catch (e) {
    console.error("Failed to delete project:", e);
    return false;
  }
}
