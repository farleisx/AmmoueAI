import { auth, db, autoSaveProject } from "./fire_prompt.js";
import { GenerationEngine } from "./generation-engine.js";
import { DeploymentManager } from "./deployment-manager.js";

// --- GLOBAL STATE ---
export const projectState = {
    id: new URLSearchParams(window.location.search).get('id') || null,
    currentPage: 'landing',
    pages: { landing: "" },
    isGenerating: false
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
    tabContainer: document.getElementById('tab-container')
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
        onError: (err) => alert("Generation Error: " + err)
    }
});

const deployer = new DeploymentManager({
    ui,
    callbacks: {
        getProjectState: () => projectState,
        onSuccess: (url) => window.open(url, '_blank'),
        onLimitReached: () => alert("Upgrade to Pro to deploy more sites!")
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
        attachedImages: [] // Add logic to collect images if needed
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
