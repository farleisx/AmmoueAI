import { auth, getUsage, autoSaveProject, db } from "./fire_prompt.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { generateProjectStream } from "./generator_service.js";
import { deployProject, renameRemoteProject } from "./deployment_service.js";
import { downloadProjectFiles, listProjectFiles } from "./download_service.js";
import { initAttachmentService, getAttachedImages, clearAttachments } from "./attachment_service.js";
import { initUIService, updateCountdown } from "./ui_service.js";
import { initLiveEditor } from "./editor_service.js";

let currentUser = null;
let currentProjectId = null;
let projectPages = { landing: "" };

onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "/login";
    else { currentUser = user; syncUsage(); startCountdown(); }
});

// INITIALIZE ALL SERVICES
initUIService();
initAttachmentService('image-upload', 'attach-btn', 'attachment-rack', 'image-preview-modal', 'modal-img');
initLiveEditor(document.getElementById('preview-frame'));

async function syncUsage() {
    if (!currentUser) return;
    const usage = await getUsage(currentUser.uid);
    document.getElementById('credit-display').innerText = `Credits: ${usage.dailyCount || 0}`;
}

function startCountdown() {
    let timeLeft = 3600 * 24; // Example 24h reset
    setInterval(() => {
        timeLeft--;
        updateCountdown(timeLeft);
    }, 1000);
}

// DEVICE TOGGLE (FIXED UI LOGIC)
const setPreviewSize = (type) => {
    const container = document.getElementById('preview-container');
    const frame = document.getElementById('preview-frame');
    const btns = { desktop: 'view-desktop', tablet: 'view-tablet', mobile: 'view-mobile' };
    
    Object.values(btns).forEach(id => {
        const btn = document.getElementById(id);
        btn.classList.remove('text-white', 'bg-white/10');
        btn.classList.add('text-gray-500');
    });
    
    const activeBtn = document.getElementById(btns[type]);
    activeBtn.classList.remove('text-gray-500');
    activeBtn.classList.add('text-white', 'bg-white/10');

    if (type === 'desktop') { 
        container.style.maxWidth = '1100px'; 
        frame.style.width = '100%'; 
    }
    else if (type === 'tablet') { 
        container.style.maxWidth = '768px'; 
        frame.style.width = '768px'; 
    }
    else { 
        container.style.maxWidth = '375px'; 
        frame.style.width = '375px'; 
    }
};

document.getElementById('view-desktop').onclick = () => setPreviewSize('desktop');
document.getElementById('view-tablet').onclick = () => setPreviewSize('tablet');
document.getElementById('view-mobile').onclick = () => setPreviewSize('mobile');

// LOGOUT ACTION
document.getElementById('logout-btn').onclick = () => signOut(auth);

// MODAL TOGGLES
document.getElementById('project-name-display').onclick = () => {
    document.getElementById('rename-modal').style.display = 'flex';
};

document.getElementById('publish-btn').onclick = () => {
    document.getElementById('publish-modal').style.display = 'flex';
};

// DOWNLOAD MODAL LOGIC
document.getElementById('download-btn').onclick = async () => {
    if (!currentProjectId) return alert("Generate something first!");
    
    const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
    const snap = await getDoc(projectRef);
    if (snap.exists()) {
        const files = listProjectFiles(snap.data().pages || {});
        const listContainer = document.getElementById('file-list-display');
        listContainer.innerHTML = files.map(f => `<div class="flex items-center gap-2 text-gray-400 text-sm py-1"><i data-lucide="file-code" class="w-4 h-4 text-emerald-500"></i> ${f}</div>`).join('');
        lucide.createIcons();
    }
    
    document.getElementById('download-modal').style.display = 'flex';
};

document.getElementById('confirm-download').onclick = async () => {
    const btn = document.getElementById('confirm-download');
    btn.innerText = "Zipping...";
    await downloadProjectFiles(currentProjectId, currentUser.uid);
    btn.innerText = "Download ZIP";
    document.getElementById('download-modal').style.display = 'none';
};

// RENAME ACTION
document.getElementById('confirm-rename').onclick = async () => {
    const newName = document.getElementById('new-project-name').value;
    if (!currentProjectId) return alert("No active project");
    const idToken = await currentUser.getIdToken();
    const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", String(currentProjectId));
    await updateDoc(projectRef, { projectName: newName });
    await renameRemoteProject(currentProjectId, idToken, newName);
    document.getElementById('project-name-display').innerText = newName;
    document.getElementById('rename-modal').style.display = 'none';
};

// PUBLISH ACTION
document.getElementById('confirm-publish').onclick = async () => {
    const slug = document.getElementById('publish-slug').value;
    if (!currentProjectId) return alert("Save project first");
    const idToken = await currentUser.getIdToken();
    const res = await deployProject(currentProjectId, idToken, { slug });
    window.open(res.deploymentUrl, '_blank');
    document.getElementById('publish-modal').style.display = 'none';
};

// CODE SIDEBAR
document.getElementById('toggle-code').onclick = () => {
    document.getElementById('code-sidebar').classList.toggle('open');
};
document.getElementById('close-code').onclick = () => {
    document.getElementById('code-sidebar').classList.remove('open');
};

// GENERATE ACTION
document.getElementById('generate-btn').onclick = async () => {
    const prompt = document.getElementById('prompt-input').value;
    const idToken = await currentUser.getIdToken();
    if (!currentProjectId) {
        currentProjectId = await autoSaveProject(projectPages, prompt, null, currentUser.uid, "Start", "landing", "Project");
    }
    
    document.getElementById('code-sidebar').classList.add('open');
    document.getElementById('code-output').innerText = ""; 
    
    await generateProjectStream(prompt, "vanilla", currentProjectId, idToken, 
        (chunk) => { document.getElementById('code-output').innerText += chunk; },
        () => syncUsage(),
        (file) => { document.getElementById('thinking-status').innerText = `Architecting: ${file}`; }
    );
    clearAttachments();
};
