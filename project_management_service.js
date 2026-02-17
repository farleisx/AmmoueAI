// project_management_service.js
import { db } from "./fire_prompt.js";
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

export async function refreshFileState(currentProjectId, currentUser, updateFileTabsUI, displayActiveFile, activeFile, bridge) {
    if (!currentProjectId || !currentUser) return {};
    const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
    const snap = await getDoc(projectRef);
    let files = {};
    if (snap.exists()) {
        const data = snap.data().pages || {};
        Object.keys(data).forEach(k => { files[k] = data[k].content || ""; });
        
        // Restore Persistent AI Action Logs
        const logsContent = snap.data().logsContent || "";
        const actionContainer = document.getElementById('ai-actions-list');
        if (actionContainer && logsContent) {
            actionContainer.innerHTML = logsContent;
            actionContainer.scrollTop = actionContainer.scrollHeight;
        }

        if (snap.data().lastDeploymentUrl) {
            const linkArea = document.getElementById('deployment-link-area');
            if(linkArea) {
                const url = snap.data().lastDeploymentUrl;
                linkArea.innerHTML = `<a href="${url}" target="_blank" class="text-emerald-400 text-xs font-mono hover:underline flex items-center justify-center gap-1 mt-2"><i data-lucide="external-link" class="w-3 h-3"></i> ${url}</a>`;
                linkArea.classList.remove('hidden');
                lucide.createIcons();
            }
        }
        updateFileTabsUI(files, activeFile);
        displayActiveFile(files, activeFile);
        if (files[activeFile]) {
            bridge.update(files[activeFile]);
        }
    }
    return files;
}

export async function loadExistingProject(pid, currentUser, refreshCallback) {
    const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", pid);
    const snap = await getDoc(projectRef);
    if (snap.exists()) {
        document.getElementById('project-name-display').innerText = snap.data().projectName || "Untitled";
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?id=' + pid;
        window.history.pushState({ path: newUrl }, '', newUrl);
        await refreshCallback(pid);
    }
}

export async function handleRenameLogic(currentProjectId, currentUser, db, updateDoc, doc, renameRemoteProject, showCustomAlert) {
    const newName = document.getElementById('new-project-name').value;
    if (!currentProjectId) {
        document.getElementById('rename-modal').style.display = 'none';
        showCustomAlert("Error", "No active project to rename. Start building first!");
        return;
    }
    const idToken = await currentUser.getIdToken();
    const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", String(currentProjectId));
    await updateDoc(projectRef, { projectName: newName });
    await renameRemoteProject(currentProjectId, idToken, newName);
    document.getElementById('project-name-display').innerText = newName;
    document.getElementById('rename-modal').style.display = 'none';
}

export async function forkProject(currentProjectId, currentUser) {
    if (!currentProjectId || !currentUser) return;

    // Show loading overlay
    const overlay = document.createElement('div');
    overlay.id = 'remix-loading-overlay';
    overlay.style = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;color:white;font-family:sans-serif;';
    overlay.innerHTML = `
        <div style="border:4px solid #f3f3f3;border-top:4px solid #10b981;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin-bottom:15px;"></div>
        <div style="font-weight:bold;letter-spacing:0.05em;">REMIXING PROJECT...</div>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(overlay);

    try {
        const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
        const snap = await getDoc(projectRef);
        
        if (snap.exists()) {
            const originalData = snap.data();
            const remixedData = {
                ...originalData,
                projectName: `${originalData.projectName || "Untitled"} (Remix)`,
                createdAt: serverTimestamp(),
                lastModified: serverTimestamp(),
                lastDeploymentUrl: null 
            };

            const projectsCol = collection(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects");
            const newDoc = await addDoc(projectsCol, remixedData);
            
            window.location.href = window.location.origin + window.location.pathname + '?id=' + newDoc.id;
        }
    } catch (error) {
        console.error("Remix failed:", error);
        if (document.getElementById('remix-loading-overlay')) {
            document.getElementById('remix-loading-overlay').remove();
        }
        alert("Failed to remix project. Please try again.");
    }
}
