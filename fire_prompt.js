// fire.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, updateDoc, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// 🔹 Firebase Config (actual credentials)
export const firebaseConfig = {
    apiKey: "AIzaSyAmnZ69YDcEFcmuXIhmGxDUSPULxpI-Bmg",
    authDomain: "ammoueai.firebaseapp.com",
    projectId: "ammoueai",
    storageBucket: "ammoueai.firebasestorage.app",
    messagingSenderId: "135818868149",
    appId: "1:135818868149:web:db9280baf9540a3339d5fc"
};

// 🔹 Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = firebaseConfig.projectId; // or any custom string

// 🔹 Helper functions
export async function getUserPlan(userId) {
    try {
        const userDocRef = doc(db, "users", userId);
        const userDoc = await getDoc(userDocRef);
        return userDoc.exists() ? userDoc.data().plan || 'free' : 'free';
    } catch (error) {
        console.error("Failed to fetch user plan:", error);
        return 'free';
    }
}

export async function autoSaveProject(htmlContent, userPrompt, existingProjectId, currentUserId) {
    if (!currentUserId || !htmlContent) return null;
    try {
        const projectsRef = collection(db, "artifacts", appId, "users", currentUserId, "projects");
        if (existingProjectId) {
            const docRef = doc(projectsRef, existingProjectId);
            await updateDoc(docRef, {
                prompt: userPrompt.replace(/\\n/g, "\n"),
                htmlContent,
                updatedAt: serverTimestamp(),
            });
            return existingProjectId;
        } else {
            const newDocRef = await addDoc(projectsRef, {
                prompt: userPrompt.replace(/\\n/g, "\n"),
                htmlContent,
                deploymentUrl: null,
                createdAt: serverTimestamp(),
            });
            return newDocRef.id;
        }
    } catch (error) {
        console.error("Error during auto-save:", error);
        return null;
    }
}

export async function updateProjectDeploymentUrl(projectId, deploymentUrl, currentUserId) {
    if (!currentUserId || !projectId) return;
    try {
        const projectDocRef = doc(db, "artifacts", appId, "users", currentUserId, "projects", projectId);
        await updateDoc(projectDocRef, {
            deploymentUrl: deploymentUrl,
        });
    } catch (error) {
        console.error("Failed to update deployment URL in Firestore:", error);
    }
}

export async function incrementCounter(userId, field) {
    try {
        const userDocRef = doc(db, "users", userId);
        const updateData = {};
        updateData[field] = increment(1);
        await updateDoc(userDocRef, updateData);
    } catch (e) {
        console.error(`Failed to increment ${field}:`, e);
    }
}
