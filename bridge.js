import { auth, db, autoSaveProject, getUserProjects } from "./fire_prompt.js";
import { GenerationEngine } from "./generation-engine.js";
import { DeploymentManager } from "./deployment-manager.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

// --- GLOBAL STATE ---
export const projectState = {
    id: new URLSearchParams(window.location.search).get('id') || null,
    currentPage: 'landing',
    pages: { landing: "" },
    isGenerating: false,
    attachedImages: [] // Added for image support
};

// --- UI SELECTORS ---
const ui = {
    genBtn: document.getElementById('generate-btn'),
    publishBtn: document.getElementById('publish-btn'),
    thinkingBox: document.getElementById('thinking-box'),
    progressBar: document.getElementById('progress-bar'),
    progressFill: document.getElementById('progress-fill'),
    logs: document.getElementById('action-logs'),
    preview: document.getElementById('preview-frame'),
    tabContainer: document.getElementById('tab-container'),
    imageInput: document.getElementById('image-input'),
    imagePreview: document.getElementById('image-preview-zone'),
    historyList: document.getElementById('history-list')
};

// --- ENGINE INIT ---
const engine = new GenerationEngine({
    ui,
    callbacks: {
        onCodeUpdate: (code, name) => {
            if (projectState.currentPage === name) {
                const blob = new Blob([code], { type: 'text/html' });
                ui.preview.src = URL.createObjectURL(blob);
            }
        },
        onNewPage: (name) => {
            if (!projectState.pages[name]) projectState.pages[name] = "";
            engine.renderTabs(projectState, ui.tabContainer);
        },
        onAction: (text) => {
            ui.logs.innerHTML += `<div class="text-indigo-400">> ${text}</div>`;
            ui.logs.scrollTop = ui.logs.scrollHeight;
        },
        onError: (err) => alert("Generation Error: " + err),
        getProjectState: () => projectState // Required by DeploymentManager healing
    }
});

const deployer = new DeploymentManager({
    ui,
    callbacks: {
        getProjectState: () => projectState,
        onSuccess: (url) => window.open(url, '_blank'),
        onLimitReached: () => alert("Upgrade to Pro to deploy more sites!"),
        onFailure: () => console.log("Deployment failed.")
    }
});

// --- HISTORY LOGIC ---
async function loadHistory(user) {
    if (!user) return;
    const projects = await getUserProjects(user.uid);
    ui.historyList.innerHTML = projects.map(p => `
        <div onclick="window.loadProject('${p.id}')" class="p-2 mb-2 rounded bg-white/5 hover:bg-white/10 cursor-pointer border border-white/5 transition-all">
            <div class="text-[10px] font-bold truncate text-slate-300">${p.prompt || 'Untitled Project'}</div>
            <div class="text-[8px] text-slate-500">${new Date(p.updatedAt?.seconds * 1000).toLocaleDateString()}</div>
        </div>
    `).join('');
}

window.loadProject = (id) => {
    window.location.search = `?id=${id}`;
};

onAuthStateChanged(auth, (user) => {
    if (user) loadHistory(user);
});

// --- IMAGE HANDLING LOGIC ---
ui.imageInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    ui.imagePreview.innerHTML = '';
    projectState.attachedImages = [];

    for (const file of files) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result;
            projectState.attachedImages.push(base64);
            
            // Visual indicator
            const img = document.createElement('img');
            img.src = base64;
            img.className = "w-10 h-10 object-cover rounded border border-white/20";
            ui.imagePreview.appendChild(img);
        };
        reader.readAsDataURL(file);
    }
});

// --- BRIDGE FUNCTIONS ---
window.switchPage = (name) => {
    projectState.currentPage = name;
    engine.renderTabs(projectState, ui.tabContainer);
    const code = projectState.pages[name] || "";
    const blob = new Blob([code], { type: 'text/html' });
    ui.preview.src = URL.createObjectURL(blob);
};

window.triggerGenerate = async () => {
    const prompt = document.getElementById('user-prompt').value;
    if (!prompt) return;
    
    await engine.start({
        prompt,
        auth,
        projectState,
        attachedImages: projectState.attachedImages // Now passing the real images
    });
};

window.triggerDeploy = async () => {
    await deployer.deploy({
        html: projectState.pages[projectState.currentPage],
        projectId: projectState.id,
        slug: `site-${Date.now()}`,
        auth,
        engine
    });
};
