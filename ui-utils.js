import { auth, db, getUserProjects } from "./fire_prompt.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc as firestoreDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

export async function updateUIUsage(userId, ui) {
    if (!userId) return;
    const usage = await getUsage(userId);
    const limit = usage.plan === "pro" ? 10 : 5;
    const remaining = Math.max(0, limit - (usage.dailyCount || 0));
    
    if (ui.creditDisplay) {
        ui.creditDisplay.innerText = `${remaining}/${limit} Credits Left`;
    }
    
    if (ui.resetDisplay && usage.dailyResetAt) {
        startResetCountdown(usage.dailyResetAt, ui);
    }
}

function startResetCountdown(resetAtMs, ui) {
    const update = () => {
        const now = Date.now();
        const diffMs = resetAtMs - now;
        if (diffMs <= 0) {
            ui.resetDisplay.innerText = `Resetting now...`;
            return;
        }
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
        ui.resetDisplay.innerText = `Resets in ${hours}h`;
        ui.resetDisplay.title = `Exact Reset in: ${hours}h ${minutes}m ${seconds}s`;
    };
    update();
    setInterval(update, 1000);
}

export async function syncNameWithFirebase(newName, projectId) {
    if (!projectId || !auth.currentUser) return;
    try {
        const docRef = firestoreDoc(db, "artifacts", "ammoueai", "users", auth.currentUser.uid, "projects", projectId);
        await updateDoc(docRef, { projectName: newName });
    } catch (e) { console.error("Name sync failed:", e); }
}

export function saveToLocal(projectState) {
    const data = {
        prompt: document.getElementById('user-prompt').value,
        pages: projectState.pages,
        id: projectState.id,
        name: projectState.name,
        framework: projectState.framework
    };
    localStorage.setItem('ammoue_autosave', JSON.stringify(data));
}

export async function loadHistory(user, ui) {
    if (!user) return;
    const projects = await getUserProjects(user.uid);
    ui.historyList.innerHTML = projects.map(p => `
        <div onclick="window.loadProject('${p.id}')" class="p-3 mb-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer border border-slate-200 dark:border-slate-700 transition-all group">
            <div class="text-[11px] font-bold truncate text-slate-800 dark:text-slate-200">${p.projectName || p.prompt || 'Untitled'}</div>
            <div class="text-[9px] text-slate-400 group-hover:text-indigo-500">${p.updatedAt ? new Date(p.updatedAt.seconds * 1000).toLocaleDateString() : 'Recent'}</div>
        </div>
    `).join('');
}
