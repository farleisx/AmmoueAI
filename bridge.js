import { auth, getUsage, autoSaveProject } from "./fire_prompt.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { generateProjectStream } from "./generator_service.js";
import { deployProject } from "./deployment_service.js";
import { initAttachmentService, getAttachedImages, clearAttachments } from "./attachment_service.js";

/* ================= STATE ================= */
let currentUser = null;
let currentProjectId = null;
let projectPages = { landing: "" };

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

async function syncUsage() {
    if (!currentUser) return;
    const usage = await getUsage(currentUser.uid);
    const display = document.getElementById('credit-display');
    if (display) display.innerText = `Daily: ${usage.dailyCount || 0}`;
}

const setPreviewSize = (type) => {
    const container = document.getElementById('preview-container');
    const btns = ['view-desktop', 'view-tablet', 'view-mobile'];
    btns.forEach(id => document.getElementById(id)?.classList.remove('bg-white/10', 'text-white'));
    btns.forEach(id => document.getElementById(id)?.classList.add('text-gray-500'));

    if (type === 'desktop') {
        container.style.maxWidth = '1100px'; container.style.aspectRatio = '16/9';
        document.getElementById('view-desktop').classList.add('bg-white/10', 'text-white');
    } else if (type === 'tablet') {
        container.style.maxWidth = '768px'; container.style.aspectRatio = '3/4';
        document.getElementById('view-tablet').classList.add('bg-white/10', 'text-white');
    } else if (type === 'mobile') {
        container.style.maxWidth = '375px'; container.style.aspectRatio = '9/16';
        document.getElementById('view-mobile').classList.add('bg-white/10', 'text-white');
    }
};

document.getElementById('view-desktop')?.addEventListener('click', () => setPreviewSize('desktop'));
document.getElementById('view-tablet')?.addEventListener('click', () => setPreviewSize('tablet'));
document.getElementById('view-mobile')?.addEventListener('click', () => setPreviewSize('mobile'));
document.getElementById('toggle-code')?.addEventListener('click', () => sidebar.classList.toggle('open'));
document.getElementById('close-code')?.addEventListener('click', () => sidebar.classList.remove('open'));

/* ================= ACTIONS ================= */
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
