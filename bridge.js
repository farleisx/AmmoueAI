import { auth, db, autoSaveProject, getUserProjects, getUsage } from "./fire_prompt.js";
import { GenerationEngine } from "./generation-engine.js";
import { DeploymentManager } from "./deployment-manager.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { initPromptTyping } from "./prompt-typing.js"; 
import { updateUIUsage, saveToLocal, loadHistory, syncNameWithFirebase, generateUniqueProjectName, toggleTheme, setViewport, copyCollaborationLink, openDownloadModal, togglePublishModal, applyStylePreset, toggleExpandFiles, startVoicePrompt } from "./project-utils.js";

// --- GLOBAL STATE ---
export const projectState = {
    id: new URLSearchParams(window.location.search).get('id') || null,
    currentPage: 'landing',
    pages: { landing: "" },
    isGenerating: false,
    attachedImages: [],
    name: "Untitled Project",
    framework: "vanilla"
};

let generationAbortController = null;
let hasUnsavedChanges = false;

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
    voiceBtn: document.getElementById('voice-btn'),
    nameDisplay: document.getElementById('project-name-display'),
    stopBtn: document.getElementById('stop-gen-btn'),
    creditDisplay: document.getElementById('credit-limit-display'),
    resetDisplay: document.getElementById('credit-reset-display'),
    unsavedIndicator: document.getElementById('unsaved-indicator'),
    frameworkLabel: document.getElementById('framework-label')
};

// --- WINDOW EXPOSURE (Fixes ReferenceErrors) ---
window.toggleTheme = toggleTheme;
window.setViewport = setViewport;
window.copyCollaborationLink = copyCollaborationLink;
window.openDownloadModal = openDownloadModal;
window.togglePublishModal = togglePublishModal;
window.applyStylePreset = applyStylePreset;
window.toggleExpandFiles = toggleExpandFiles;
window.startVoicePrompt = startVoicePrompt;
window.triggerGenerate = async () => { /* Logic below */ };
window.stopGeneration = (manual = true) => { /* Logic below */ };

window.toggleCodeView = () => {
    const editor = document.getElementById('code-editor-view');
    const iframe = document.getElementById('preview-frame');
    if (editor.classList.contains('hidden')) {
        editor.value = projectState.pages[projectState.currentPage];
        editor.classList.remove('hidden');
        iframe.classList.add('hidden');
    } else {
        editor.classList.add('hidden');
        iframe.classList.remove('hidden');
    }
};

window.openFullPreview = () => {
    const code = projectState.pages[projectState.currentPage];
    const newWin = window.open();
    newWin.document.write(code);
    newWin.document.close();
};

window.setUnsavedStatus = (status) => {
    hasUnsavedChanges = status;
    if (ui.unsavedIndicator) {
        ui.unsavedIndicator.innerText = status ? "● Unsaved" : "Saved";
        ui.unsavedIndicator.className = status ? "text-[9px] font-bold text-amber-500" : "text-[9px] font-bold text-emerald-500";
    }
};

window.addEventListener('message', (e) => {
    if (e.data?.type === 'iframe-error') {
        ui.logs.innerHTML += `<div class="text-red-400">⚠ ${e.data.message}</div>`;
    }
});

// --- ENGINE INIT ---
const engine = new GenerationEngine({
    ui,
    callbacks: {
        onCodeUpdate: (code, name) => {
            if (projectState.currentPage === name) {
                const blob = new Blob([code], { type: 'text/html' });
                ui.preview.src = URL.createObjectURL(blob);
            }
            saveToLocal(projectState);
        },
        onNewPage: (name) => {
            if (!projectState.pages[name]) projectState.pages[name] = "";
            engine.renderTabs(projectState, ui.tabContainer);
            saveToLocal(projectState);
        },
        onAction: (text) => {
            ui.logs.innerHTML += `<div class="text-indigo-400 font-medium"> ${text}</div>`;
            ui.logs.scrollTop = ui.logs.scrollHeight;
        },
        onError: (err) => {
            if (err.name === 'AbortError') return;
            ui.genBtn.classList.remove('gen-active');
            ui.stopBtn.classList.add('hidden');
            alert("Error: " + err.message);
        },
        getProjectState: () => projectState 
    }
});

const deployer = new DeploymentManager({
    ui,
    callbacks: {
        getProjectState: () => projectState,
        onSuccess: (url) => {
            window.setUnsavedStatus(false);
            window.open(url, '_blank');
        }
    }
});

// --- GENERATION LOGIC ---
window.triggerGenerate = async () => {
    const prompt = document.getElementById('user-prompt').value;
    if (!prompt || projectState.isGenerating) return;

    const previousHTML = projectState.pages[projectState.currentPage];
    generationAbortController = new AbortController();
    projectState.isGenerating = true;

    ui.genBtn.classList.add('gen-active');
    ui.stopBtn.classList.remove('hidden');
    if (ui.progressBar) ui.progressBar.classList.remove('hidden');

    try {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ prompt, framework: projectState.framework, projectId: projectState.id }),
            signal: generationAbortController.signal
        });

        if (response.status === 429) {
            alert("Credit limit reached.");
            return window.stopGeneration(false);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let chunkCount = 0;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunkCount++;
            if (ui.progressFill) ui.progressFill.style.width = `${Math.min(chunkCount * 2, 100)}%`;
            
            const chunk = decoder.decode(value);
            chunk.split("\n").forEach(line => {
                if (line.startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === "[DONE]") return;
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.text) engine.processAIChunk(data.text);
                    } catch (e) {}
                }
            });
        }

        const finalHTML = projectState.pages[projectState.currentPage];
        if (previousHTML && previousHTML !== finalHTML) {
            ui.logs.innerHTML += `<div class="text-emerald-400">✓ Page updated</div>`;
        }
        if (finalHTML.includes('react') || finalHTML.includes('ReactDOM')) {
            projectState.framework = 'react';
            if (ui.frameworkLabel) ui.frameworkLabel.innerText = 'React';
        }

    } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
    } finally {
        window.stopGeneration(false);
        saveToLocal(projectState);
        updateUIUsage(auth.currentUser.uid, ui);
    }
};

window.stopGeneration = (manual = true) => {
    if (manual) generationAbortController?.abort();
    projectState.isGenerating = false;
    ui.genBtn.classList.remove('gen-active');
    ui.genBtn.innerHTML = '➤';
    ui.stopBtn.classList.add('hidden');
    if (ui.progressBar) ui.progressBar.classList.add('hidden');
};

// --- IMAGE HANDLING ---
ui.imageInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const MAX_SIZE = 3 * 1024 * 1024;
    for (const file of files) {
        if (file.size > MAX_SIZE) {
            alert(`Image ${file.name} is too large (max 3MB)`);
            continue;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            projectState.attachedImages.push(ev.target.result);
            renderImages();
        };
        reader.readAsDataURL(file);
    }
});

function renderImages() {
    ui.imagePreview.innerHTML = projectState.attachedImages.map((img, i) => `
        <div class="relative group">
            <img src="${img}" class="w-12 h-12 object-cover rounded-lg cursor-pointer" onclick="window.zoomImage('${img}')">
            <button onclick="window.removeImage(${i})" class="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full">✕</button>
        </div>
    `).join('');
}

window.removeImage = (i) => { projectState.attachedImages.splice(i, 1); renderImages(); };

// --- KEYBOARD ---
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        window.triggerGenerate();
    }
});

// --- PROJECT HELPERS ---
window.createNewProject = () => {
    if (hasUnsavedChanges && !confirm("Discard unsaved changes?")) return;
    localStorage.removeItem('ammoue_autosave');
    window.location.href = window.location.pathname;
};

window.loadProject = (id) => {
    if (hasUnsavedChanges && !confirm("Load project and lose unsaved changes?")) return;
    const url = new URL(window.location);
    url.searchParams.set('id', id);
    window.location.href = url.href;
};

async function loadProjectData(projectId, userId) {
    const docRef = doc(db, "artifacts", "ammoueai", "users", userId, "projects", projectId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        const data = snap.data();
        projectState.pages = data.pages || { landing: data.htmlContent || "" };
        projectState.name = data.projectName || "Untitled";
        ui.nameDisplay.innerText = projectState.name;
        document.getElementById('user-prompt').value = data.prompt || "";
        engine.renderTabs(projectState, ui.tabContainer);
        window.switchPage('landing');
        window.setUnsavedStatus(false);
    }
}

function loadFromLocal() {
    const saved = localStorage.getItem('ammoue_autosave');
    if (!saved) return;
    const data = JSON.parse(saved);
    projectState.pages = data.pages || { landing: "" };
    projectState.name = data.name || "Untitled";
    ui.nameDisplay.innerText = projectState.name;
    document.getElementById('user-prompt').value = data.prompt || "";
    engine.renderTabs(projectState, ui.tabContainer);
    window.switchPage('landing');
}

window.editProjectName = () => {
    const input = document.getElementById('new-project-name-input');
    input.value = projectState.name;
    document.getElementById('rename-modal').classList.remove('hidden');
};

window.confirmRename = () => {
    const name = document.getElementById('new-project-name-input').value.trim();
    if (name) {
        projectState.name = name;
        ui.nameDisplay.innerText = name;
        syncNameWithFirebase(name, projectState.id, auth.currentUser.uid);
        document.getElementById('rename-modal').classList.add('hidden');
    }
};

window.switchPage = (name) => {
    projectState.currentPage = name;
    engine.renderTabs(projectState, ui.tabContainer);
    const blob = new Blob([projectState.pages[name]], { type: 'text/html' });
    ui.preview.src = URL.createObjectURL(blob);
};

onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "/login";
    else {
        loadHistory(user, ui);
        updateUIUsage(user.uid, ui);
        if (projectState.id) loadProjectData(projectState.id, user.uid);
        else loadFromLocal();
    }
});

if (!projectState.id) generateUniqueProjectName(projectState, ui);
