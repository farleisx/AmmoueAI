// project_management_service.js
import { db } from "./fire_prompt.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

export async function refreshFileState(currentProjectId, currentUser, updateFileTabsUI, displayActiveFile, activeFile, bridge) {
    if (!currentProjectId || !currentUser) return {};
    const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
    const snap = await getDoc(projectRef);
    let files = {};
    if (snap.exists()) {
        const data = snap.data().pages || {};
        Object.keys(data).forEach(k => { files[k] = data[k].content || ""; });
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
