// data_sync_service.js
import { syncUsage, startCountdown } from "./usage_service.js";
import { updateCountdown } from "./ui_service.js";
import { refreshFileState, loadExistingProject } from "./project_management_service.js";

export async function syncUsageData(currentUser, currentUsageData, updateCallback) {
    const data = await syncUsage(currentUser);
    if (data) {
        if (currentUsageData.count !== data.count) {
            const creditEl = document.getElementById('credit-display');
            if (creditEl) {
                creditEl.classList.add('scale-110', 'text-emerald-400');
                setTimeout(() => creditEl.classList.remove('scale-110', 'text-emerald-400'), 400);
            }
        }
        updateCallback(data);
        startCountdown(data.resetAt, updateCountdown, () => syncUsageData(currentUser, data, updateCallback));
    }
}

export async function refreshFiles(currentProjectId, currentUser, updateFileTabsUI, displayActiveFile, activeFile, bridge) {
    return await refreshFileState(currentProjectId, currentUser, updateFileTabsUI, displayActiveFile, activeFile, bridge);
}

export async function loadProject(pid, currentUser, callback) {
    await loadExistingProject(pid, currentUser, callback);
}
