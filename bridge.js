import { 
    auth, 
    db, 
    getUsage, 
    incrementCounter, 
    autoSaveProject, 
    deleteProject 
} from "./fire_prompt.js";
import { 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { generateProjectStream } from "./generator_service.js";
import { initAttachmentService, getAttachedImages, clearAttachments } from "./attachment_service.js";

/* ================= STATE MANAGEMENT ================= */
let currentUser = null;
let currentProjectId = null;
let projectPages = { landing: "" };

/* ================= AUTH PROTECTION ================= */
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "/login";
    } else {
        currentUser = user;
        syncUsage();
    }
});

/* ================= INITIALIZE SERVICES ================= */
initAttachmentService('image-upload', 'attach-btn', 'attachment-rack', 'image-preview-modal', 'modal-img');

/* ================= SIDEBAR LOGIC ================= */
const sidebar = document.getElementById('code-sidebar');
const toggleCode = document.getElementById('toggle-code');
const closeCode = document.getElementById('close-code');

toggleCode?.addEventListener('click', () => sidebar.classList.toggle('open'));
closeCode?.addEventListener('click', () => sidebar.classList.remove('open'));

/* ================= UI SYNC ================= */
async function syncUsage() {
    if (!currentUser) return;
    const usage = await getUsage(currentUser.uid);
    const display = document.getElementById('credit-display');
    if (display) {
        display.innerText = `Daily: ${usage.dailyCount || 0} / ${usage.plan === 'pro' ? '10' : '5'}`;
    }
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

/* ================= GENERATION LOGIC ================= */
const generateBtn = document.getElementById('generate-btn');
const promptInput = document.getElementById('prompt-input');
const codeOutput = document.getElementById('code-output');

if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        if (!prompt || !currentUser) return;

        try {
            generateBtn.disabled = true;
            generateBtn.innerText = "Building...";
            codeOutput.innerText = "";
            sidebar.classList.add('open');

            const idToken = await currentUser.getIdToken();

            if (!currentProjectId) {
                currentProjectId = await autoSaveProject(projectPages, prompt, null, currentUser.uid, "Start", "landing", "Project");
            }

            // Backend call including attached images state
            const images = getAttachedImages();

            await generateProjectStream(
                prompt, "vanilla", currentProjectId, idToken, 
                (chunk) => {
                    codeOutput.innerText += chunk;
                    codeOutput.parentElement.scrollTop = codeOutput.parentElement.scrollHeight;
                },
                (statusData) => {
                    if (statusData.status === 'completed') {
                        generateBtn.disabled = false;
                        generateBtn.innerText = "Generate";
                        syncUsage();
                    }
                }
            );

            promptInput.value = "";
            clearAttachments();
        } catch (err) {
            alert(err.message);
            generateBtn.disabled = false;
            generateBtn.innerText = "Generate";
        }
    });
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "/login");
});
