import { auth, db, autoSaveProject, getUserProjects } from "./fire_prompt.js";
import { GenerationEngine } from "./generation-engine.js";
import { DeploymentManager } from "./deployment-manager.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// --- GLOBAL STATE ---
export const projectState = {
    id: new URLSearchParams(window.location.search).get('id') || null,
    currentPage: 'landing',
    pages: { landing: "" },
    isGenerating: false,
    attachedImages: [] 
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
    historyList: document.getElementById('history-list'),
    previewContainer: document.getElementById('preview-wrapper'),
    publishModal: document.getElementById('publish-modal'),
    slugInput: document.getElementById('site-slug'),
    downloadBtn: document.getElementById('download-btn'),
    voiceBtn: document.getElementById('voice-btn') // New Voice UI selector
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
            ui.logs.innerHTML += `<div class="text-indigo-400 font-medium"> ${text}</div>`;
            ui.logs.scrollTop = ui.logs.scrollHeight;
        },
        onError: (err) => alert("Generation Error: " + err),
        getProjectState: () => projectState 
    }
});

const deployer = new DeploymentManager({
    ui,
    callbacks: {
        getProjectState: () => projectState,
        onSuccess: (url) => {
            window.open(url, '_blank');
            ui.publishModal.classList.add('hidden');
        },
        onLimitReached: () => alert("Upgrade to Pro to deploy more sites!"),
        onFailure: () => console.log("Deployment failed.")
    }
});

// --- VOICE PROMPT LOGIC ---
window.startVoicePrompt = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Voice recognition not supported in this browser.");

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    ui.voiceBtn.classList.add('animate-pulse', 'text-red-500');
    recognition.start();

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('user-prompt').value += (document.getElementById('user-prompt').value ? " " : "") + transcript;
        ui.voiceBtn.classList.remove('animate-pulse', 'text-red-500');
    };

    recognition.onerror = () => ui.voiceBtn.classList.remove('animate-pulse', 'text-red-500');
    recognition.onend = () => ui.voiceBtn.classList.remove('animate-pulse', 'text-red-500');
};

// --- DOWNLOAD CODE LOGIC ---
window.downloadProjectSource = async () => {
    const { default: JSZip } = await import("https://cdn.skypack.dev/jszip");
    const zip = new JSZip();

    Object.entries(projectState.pages).forEach(([name, html]) => {
        const fileName = name === 'landing' ? 'index.html' : `${name}.html`;
        zip.file(fileName, html);
    });

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `ammoueai-project-${Date.now()}.zip`;
    link.click();
};

// --- THEME LOGIC ---
window.toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
};

if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark');
}

// --- AUTH PROTECTION ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "/login";
    } else {
        loadHistory(user);
        if (projectState.id) loadProjectData(projectState.id, user.uid);
    }
});

// --- NEW VIEWPORT LOGIC ---
window.setViewport = (type) => {
    if (type === 'mobile') {
        ui.previewContainer.style.width = '375px';
    } else {
        ui.previewContainer.style.width = '100%';
    }
};

// --- MODAL LOGIC ---
window.togglePublishModal = (show) => {
    ui.publishModal.classList.toggle('hidden', !show);
};

// --- PROJECT LOADING LOGIC ---
async function loadProjectData(projectId, userId) {
    if (!projectId || !userId) return;
    try {
        const docRef = doc(db, "artifacts", "ammoueai", "users", userId, "projects", projectId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data();
            projectState.pages = data.pages || { landing: data.htmlContent || "" };
            projectState.currentPage = 'landing';
            document.getElementById('user-prompt').value = data.prompt || "";
            engine.renderTabs(projectState, ui.tabContainer);
            window.switchPage('landing');
        }
    } catch (e) { console.error("Load failed:", e); }
}

// --- HISTORY LOGIC ---
async function loadHistory(user) {
    if (!user) return;
    const projects = await getUserProjects(user.uid);
    ui.historyList.innerHTML = projects.map(p => `
        <div onclick="window.loadProject('${p.id}')" class="p-3 mb-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer border border-slate-200 dark:border-slate-700 transition-all group">
            <div class="text-[11px] font-bold truncate text-slate-800 dark:text-slate-200">${p.prompt || 'Untitled'}</div>
            <div class="text-[9px] text-slate-400 group-hover:text-indigo-500">${new Date(p.updatedAt?.seconds * 1000).toLocaleDateString()}</div>
        </div>
    `).join('');
}

window.loadProject = (id) => {
    const url = new URL(window.location);
    url.searchParams.set('id', id);
    window.history.pushState({}, '', url);
    projectState.id = id;
    loadProjectData(id, auth.currentUser.uid);
};

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
            const img = document.createElement('img');
            img.src = base64;
            img.className = "w-10 h-10 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm";
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
    ui.progressBar.classList.remove('hidden');
    await engine.start({
        prompt,
        auth,
        projectState,
        attachedImages: projectState.attachedImages
    });
};

window.triggerDeploy = async () => {
    const slug = ui.slugInput.value.trim() || `site-${Date.now()}`;
    await deployer.deploy({
        html: projectState.pages[projectState.currentPage],
        projectId: projectState.id,
        slug: slug,
        auth,
        engine
    });
};
