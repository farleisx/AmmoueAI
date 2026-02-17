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

export async function forkProject(options) {
    const { currentProjectId, currentUser, showCustomAlert } = options;

    if (!currentProjectId || !currentUser) {
        if (showCustomAlert) showCustomAlert("Remix Error", "You need an active project to remix.");
        return;
    }

    // Create and Show Remix Loading Overlay
    const overlay = document.createElement('div');
    overlay.id = 'remix-loading-overlay';
    overlay.style = 'position:fixed;inset:0;background:rgba(3,3,3,0.9);backdrop-filter:blur(10px);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:Geist,sans-serif;';
    overlay.innerHTML = `
        <div style="width:300px;text-align:center;">
            <div style="margin-bottom:20px;display:flex;justify-content:center;">
                <div style="width:40px;height:40px;border:3px solid rgba(16,185,129,0.1);border-top:3px solid #10b981;border-radius:50%;animation:remix-spin 0.8s linear infinite;"></div>
            </div>
            <h2 style="font-size:18px;font-weight:600;letter-spacing:-0.02em;margin-bottom:8px;">Remixing Project</h2>
            <p style="font-size:12px;color:#666;margin-bottom:24px;">Creating your personal clone and initializing workspace...</p>
            <div style="width:100%;height:4px;background:rgba(255,255,255,0.05);border-radius:10px;overflow:hidden;">
                <div id="remix-progress-bar" style="width:0%;height:100%;background:#10b981;transition:width 0.5s ease;"></div>
            </div>
        </div>
        <style>@keyframes remix-spin { to { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(overlay);

    const bar = document.getElementById('remix-progress-bar');
    
    try {
        // Step 1: Fetch source
        if(bar) bar.style.width = '30%';
        const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
        const snap = await getDoc(projectRef);

        if (!snap.exists()) throw new Error("Project not found");

        // Step 2: Prepare data
        if(bar) bar.style.width = '60%';
        const sourceData = snap.data();
        const remixedData = {
            ...sourceData,
            projectName: `${sourceData.projectName || "Untitled"} (Remix)`,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp(),
            lastDeploymentUrl: null // Remix starts fresh without a deployment
        };

        // Step 3: Write new doc
        const projectsCol = collection(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects");
        const newDoc = await addDoc(projectsCol, remixedData);

        // Step 4: Finalize
        if(bar) bar.style.width = '100%';
        setTimeout(() => {
            window.location.href = window.location.origin + window.location.pathname + '?id=' + newDoc.id;
        }, 500);

    } catch (error) {
        console.error("Remix failure:", error);
        if (overlay) overlay.remove();
        if (showCustomAlert) {
            showCustomAlert("Remix Failed", error.message || "An error occurred while cloning.");
        }
    }
}
