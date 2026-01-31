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

/* ================= STATE MANAGEMENT ================= */
let currentUser = null;
let currentProjectId = null;
let projectPages = { landing: "" };
let fullStreamedText = "";

/* ================= AUTH PROTECTION ================= */
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "/login";
    } else {
        currentUser = user;
        syncUsage();
    }
});

/* ================= UI LOGIC ================= */
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
    if (!container) return;
    const btns = ['view-desktop', 'view-tablet', 'view-mobile'];
    btns.forEach(id => {
        const btn = document.getElementById(id);
        btn?.classList.remove('bg-white/10', 'text-white');
        btn?.classList.add('text-gray-500');
    });

    if (type === 'desktop') {
        container.style.maxWidth = '1100px';
        container.style.aspectRatio = '16/9';
        document.getElementById('view-desktop').classList.replace('text-gray-500', 'text-white');
        document.getElementById('view-desktop').classList.add('bg-white/10');
    } else if (type === 'tablet') {
        container.style.maxWidth = '768px';
        container.style.aspectRatio = '3/4';
        document.getElementById('view-tablet').classList.replace('text-gray-500', 'text-white');
        document.getElementById('view-tablet').classList.add('bg-white/10');
    } else if (type === 'mobile') {
        container.style.maxWidth = '375px';
        container.style.aspectRatio = '9/16';
        document.getElementById('view-mobile').classList.replace('text-gray-500', 'text-white');
        document.getElementById('view-mobile').classList.add('bg-white/10');
    }
};

document.getElementById('view-desktop')?.addEventListener('click', () => setPreviewSize('desktop'));
document.getElementById('view-tablet')?.addEventListener('click', () => setPreviewSize('tablet'));
document.getElementById('view-mobile')?.addEventListener('click', () => setPreviewSize('mobile'));

/* ================= GENERATION LOGIC ================= */
const generateBtn = document.getElementById('generate-btn');
const promptInput = document.getElementById('prompt-input');
const previewFrame = document.getElementById('preview-frame');

if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        if (!prompt || !currentUser) return;

        try {
            // 1. Prepare UI
            generateBtn.disabled = true;
            generateBtn.innerText = "Generating...";
            fullStreamedText = "";
            previewFrame.innerHTML = `<div class="text-gray-400 animate-pulse">AI is architecting your project...</div>`;

            // 2. Get Firebase ID Token for Backend Auth
            const idToken = await currentUser.getIdToken();

            // 3. Create initial project doc to get an ID for the backend to use
            if (!currentProjectId) {
                currentProjectId = await autoSaveProject(
                    projectPages, 
                    prompt, 
                    null, 
                    currentUser.uid, 
                    "Initializing...", 
                    "landing", 
                    "New Project"
                );
            }

            // 4. Call Generator Service (Backend)
            await generateProjectStream(
                prompt, 
                "vanilla", 
                currentProjectId, 
                idToken, 
                (chunk) => {
                    // Update preview with raw stream or handle partial parsing
                    fullStreamedText += chunk;
                    previewFrame.innerText = "Streaming code... " + fullStreamedText.length + " bytes";
                },
                (statusData) => {
                    if (statusData.status === 'completed') {
                        generateBtn.disabled = false;
                        generateBtn.innerText = "Generate";
                        previewFrame.innerHTML = `<div class="text-emerald-600 font-bold">Project Built Successfully!</div>`;
                        syncUsage();
                    }
                }
            );

            promptInput.value = "";
        } catch (err) {
            console.error(err);
            alert("Error: " + err.message);
            generateBtn.disabled = false;
            generateBtn.innerText = "Generate";
        }
    });
}

/* ================= UTILS ================= */
document.getElementById('logout-btn')?.addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "/login");
});

export { currentProjectId, deleteProject };
