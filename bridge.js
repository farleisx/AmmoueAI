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

/* ================= STATE MANAGEMENT ================= */
let currentUser = null;
let currentProjectId = null;
let projectPages = { landing: "<h1>New Project</h1>" };

/* ================= AUTH PROTECTION ================= */
onAuthStateChanged(auth, (user) => {
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
        // Assuming your fire_prompt.js logic treats credits as a count
        display.innerText = `Daily: ${usage.dailyCount || 0}`;
    }
}

// Device Toggle Implementation
const setPreviewSize = (type) => {
    const container = document.getElementById('preview-container');
    if (!container) return;
    
    const btns = ['view-desktop', 'view-tablet', 'view-mobile'];
    btns.forEach(id => document.getElementById(id)?.classList.remove('bg-white/10', 'text-white'));
    btns.forEach(id => document.getElementById(id)?.classList.add('text-gray-500'));

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

if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        if (!prompt || !currentUser) return;

        // 1. Increment Usage
        await incrementCounter(currentUser.uid, "dailyCount");
        
        // 2. Mock AI Page Update (For UI feedback)
        projectPages.landing = `<div>Generated for: ${prompt}</div>`;
        document.getElementById('preview-frame').innerHTML = projectPages.landing;

        // 3. AutoSave via fire_prompt.js
        const savedId = await autoSaveProject(
            projectPages,
            prompt,
            currentProjectId,
            currentUser.uid,
            `User requested: ${prompt}`,
            "landing",
            "My Lovable Project"
        );

        if (savedId) {
            currentProjectId = savedId;
            console.log("Project Synced to Firestore:", currentProjectId);
        }

        promptInput.value = "";
        syncUsage();
    });
}

/* ================= UTILS ================= */
document.getElementById('logout-btn')?.addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "/login");
});

// Direct export for external triggers
export { currentProjectId, deleteProject };
