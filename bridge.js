import { auth, getUsage, autoSaveProject, db } from "./fire_prompt.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { generateProjectStream } from "./generator_service.js";
import { deployProject } from "./deployment_service.js";
import { initAttachmentService, getAttachedImages, clearAttachments } from "./attachment_service.js";

/* ================= STATE ================= */
let currentUser = null;
let currentProjectId = null;
let projectPages = { landing: "" };
let currentProjectName = "lovable-clone";

/* ================= AUTH ================= */
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "/login";
    } else {
        currentUser = user;
        syncUsage();
    }
});

/* ================= INIT SERVICES ================= */
initAttachmentService('image-upload', 'attach-btn', 'attachment-rack', 'image-preview-modal', 'modal-img');

/* ================= UI LOGIC ================= */
const sidebar = document.getElementById('code-sidebar');
const codeOutput = document.getElementById('code-output');
const thinkingStatus = document.getElementById('thinking-status');
const previewFrame = document.getElementById('preview-frame');
const previewContainer = document.getElementById('preview-container');

async function syncUsage() {
    if (!currentUser) return;
    const usage = await getUsage(currentUser.uid);
    const display = document.getElementById('credit-display');
    if (display) display.innerText = `Daily: ${usage.dailyCount || 0}`;
}

const setPreviewSize = (type) => {
    const btns = ['view-desktop', 'view-tablet', 'view-mobile'];
    btns.forEach(id => document.getElementById(id)?.classList.remove('bg-white/10', 'text-white'));
    btns.forEach(id => document.getElementById(id)?.classList.add('text-gray-500'));

    if (type === 'desktop') {
        previewContainer.style.maxWidth = '1100px'; 
        previewContainer.style.aspectRatio = '16/9';
        previewFrame.style.width = '100%';
        previewFrame.style.height = '100%';
        document.getElementById('view-desktop').classList.add('bg-white/10', 'text-white');
    } else if (type === 'tablet') {
        previewContainer.style.maxWidth = '768px'; 
        previewContainer.style.aspectRatio = '3/4';
        previewFrame.style.width = '768px';
        previewFrame.style.height = '1024px';
        document.getElementById('view-tablet').classList.add('bg-white/10', 'text-white');
    } else if (type === 'mobile') {
        previewContainer.style.maxWidth = '375px'; 
        previewContainer.style.aspectRatio = '9/16';
        previewFrame.style.width = '375px';
        previewFrame.style.height = '667px';
        document.getElementById('view-mobile').classList.add('bg-white/10', 'text-white');
    }
};

/* ================= NAVIGATION & RENAME ================= */
document.getElementById('back-to-dashboard')?.addEventListener('click', () => {
    window.location.href = "/dashboard";
});

document.getElementById('project-name-display')?.addEventListener('click', () => {
    const modal = document.getElementById('rename-modal');
    document.getElementById('new-project-name').value = currentProjectName;
    modal.style.display = 'flex';
});

document.getElementById('confirm-rename')?.addEventListener('click', async () => {
    const newName = document.getElementById('new-project-name').value.trim();
    if (newName && currentProjectId && currentUser) {
        try {
            const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
            await updateDoc(projectRef, { projectName: newName });
            currentProjectName = newName;
            document.getElementById('project-name-display').innerText = newName;
            document.getElementById('rename-modal').style.display = 'none';
        } catch (e) { alert("Rename failed: " + e.message); }
    }
});

/* ================= EVENT LISTENERS ================= */
document.getElementById('view-desktop')?.addEventListener('click', () => setPreviewSize('desktop'));
document.getElementById('view-tablet')?.addEventListener('click', () => setPreviewSize('tablet'));
document.getElementById('view-mobile')?.addEventListener('click', () => setPreviewSize('mobile'));
document.getElementById('toggle-code')?.addEventListener('click', () => sidebar.classList.toggle('open'));
document.getElementById('close-code')?.addEventListener('click', () => sidebar.classList.remove('open'));

document.getElementById('generate-btn')?.addEventListener('click', async () => {
    const prompt = document.getElementById('prompt-input').value.trim();
    if (!prompt || !currentUser) return;

    try {
        document.getElementById('generate-btn').disabled = true;
        codeOutput.innerText = "";
        sidebar.classList.add('open');
        
        const idToken = await currentUser.getIdToken();
        if (!currentProjectId) {
            currentProjectId = await autoSaveProject(projectPages, prompt, null, currentUser.uid, "Start", "landing", "Project");
        }

        await generateProjectStream(
            prompt, "vanilla", currentProjectId, idToken, 
            (chunk) => {
                codeOutput.innerText += chunk;
                codeOutput.parentElement.scrollTop = codeOutput.parentElement.scrollHeight;
            },
            (status) => {
                if (status.status === 'completed') {
                    document.getElementById('generate-btn').disabled = false;
                    thinkingStatus.innerText = "Build Finished";
                    syncUsage();
                }
            },
            (fileName) => {
                thinkingStatus.innerHTML = `<span class="flex items-center gap-2"><span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> Architecting: ${fileName}</span>`;
            }
        );
        clearAttachments();
    } catch (err) { alert(err.message); document.getElementById('generate-btn').disabled = false; }
});

document.getElementById('publish-btn')?.addEventListener('click', async () => {
    if (!currentProjectId || !currentUser) return alert("Build a project first.");
    const slug = prompt("Enter a site name (slug):");
    if (!slug) return;

    try {
        const idToken = await currentUser.getIdToken();
        const result = await deployProject(currentProjectId, idToken, { slug, framework: "vanilla" });
        window.open(result.deploymentUrl, '_blank');
    } catch (err) { alert(err.message); }
});

document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));
