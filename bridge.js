import { auth, db, autoSaveProject, getUserProjects, getUsage } from "./fire_prompt.js";
import { GenerationEngine } from "./generation-engine.js";
import { DeploymentManager } from "./deployment-manager.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { initPromptTyping } from "./prompt-typing.js"; 
import { 
    updateUIUsage, 
    saveToLocal, 
    loadHistory, 
    syncNameWithFirebase, 
    generateUniqueProjectName 
} from "./project-utils.js";

// --- GLOBAL STATE ---
export const projectState = {
    id: new URLSearchParams(window.location.search).get('id') || null,
    currentPage: 'landing',
    pages: { landing: "" },
    isGenerating: false,
    attachedImages: [],
    name: "Untitled Project",
    framework: "vanilla" // Default framework
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
    voiceBtn: document.getElementById('voice-btn'),
    header: document.querySelector('header'),
    nameDisplay: document.getElementById('project-name-display'),
    stopBtn: document.getElementById('stop-gen-btn'),
    creditDisplay: document.getElementById('credit-limit-display'),
    resetDisplay: document.getElementById('credit-reset-display')
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
            ui.genBtn.classList.remove('gen-active');
            ui.genBtn.innerHTML = '➤';
            ui.stopBtn.classList.add('hidden');
            alert("Generation Error: " + err);
        },
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

// --- GENERATION BRIDGE ---
window.triggerGenerate = async () => {
    const prompt = document.getElementById('user-prompt').value;
    if (!prompt || projectState.isGenerating) return;

    ui.genBtn.classList.add('gen-active');
    ui.genBtn.innerHTML = '<svg class="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    ui.stopBtn.classList.remove('hidden');
    if (ui.progressBar) ui.progressBar.classList.remove('hidden');

    projectState.isGenerating = true;

    try {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                prompt,
                framework: projectState.framework,
                projectId: projectState.id
            })
        });

        if (response.status === 429) {
            const data = await response.json();
            showLimitModal(data.limit, data.resetAt);
            projectState.isGenerating = false;
            ui.genBtn.classList.remove('gen-active');
            ui.genBtn.innerHTML = '➤';
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        projectState.pages = {}; 

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === "[DONE]") break;

                    try {
                        const data = JSON.parse(dataStr);
                        if (data.text) engine.processAIChunk(data.text);
                        if (data.status === "initializing") updateUIUsage(auth.currentUser.uid, ui);
                    } catch (e) {}
                }
            }
        }
    } catch (err) {
        console.error("Fetch error:", err);
    } finally {
        projectState.isGenerating = false;
        ui.genBtn.classList.remove('gen-active');
        ui.genBtn.innerHTML = '➤';
        ui.stopBtn.classList.add('hidden');
        saveToLocal(projectState);
        loadHistory(auth.currentUser, ui);
    }
};

function showLimitModal(limit, resetAt) {
    const diffMs = resetAt - Date.now();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    
    const modal = document.createElement('div');
    modal.id = "limit-modal";
    modal.className = "fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4";
    modal.innerHTML = `
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl scale-in-center">
            <div class="text-amber-500 mb-4 flex justify-center">
                <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h3 class="text-xl font-bold text-white mb-2">Daily Limit Reached</h3>
            <p class="text-slate-400 text-sm mb-6">You've used your ${limit} generations. Resets in <span class="text-indigo-400 font-bold">${hours}h</span>.</p>
            <button onclick="this.closest('#limit-modal').remove()" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all">Understood</button>
        </div>
    `;
    document.body.appendChild(modal);
}

// --- PROJECT ACTIONS ---
window.createNewProject = () => {
    localStorage.removeItem('ammoue_autosave');
    const url = new URL(window.location);
    url.searchParams.delete('id');
    window.history.pushState({}, '', url);
    location.reload(); 
};

window.loadProject = (id) => {
    localStorage.removeItem('ammoue_autosave');
    const url = new URL(window.location);
    url.searchParams.set('id', id);
    window.history.pushState({}, '', url);
    projectState.id = id;
    loadProjectData(id, auth.currentUser.uid);
};

async function loadProjectData(projectId, userId) {
    if (!projectId || !userId) return;
    try {
        const docRef = doc(db, "artifacts", "ammoueai", "users", userId, "projects", projectId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data();
            projectState.pages = data.pages || { landing: data.htmlContent || "" };
            projectState.currentPage = 'landing';
            projectState.name = data.projectName || ui.nameDisplay.innerText;
            ui.nameDisplay.innerText = projectState.name;
            document.getElementById('user-prompt').value = data.prompt || "";
            engine.renderTabs(projectState, ui.tabContainer);
            window.switchPage('landing');
        }
    } catch (e) { console.error("Load failed:", e); }
}

function loadFromLocal() {
    const saved = localStorage.getItem('ammoue_autosave');
    if (!saved) return;
    const data = JSON.parse(saved);
    if (data.id && data.id !== projectState.id) return;
    document.getElementById('user-prompt').value = data.prompt || "";
    projectState.pages = data.pages || { landing: "" };
    projectState.name = data.name || ui.nameDisplay.innerText;
    projectState.framework = data.framework || "vanilla";
    ui.nameDisplay.innerText = projectState.name;
    engine.renderTabs(projectState, ui.tabContainer);
    window.switchPage(projectState.currentPage);
}

window.editProjectName = () => {
    const modal = document.getElementById('rename-modal');
    const input = document.getElementById('new-project-name-input');
    input.value = projectState.name;
    modal.classList.remove('hidden');
    input.focus();
};

window.confirmRename = () => {
    const input = document.getElementById('new-project-name-input');
    const newName = input.value.trim();
    if (newName !== "") {
        projectState.name = newName;
        ui.nameDisplay.innerText = projectState.name;
        saveToLocal(projectState);
        syncNameWithFirebase(projectState.name, projectState.id, auth.currentUser.uid);
        document.getElementById('rename-modal').classList.add('hidden');
    }
};

// --- CHAT & VOICE ---
window.toggleChat = () => {
    const chat = document.getElementById('chat-widget');
    chat.classList.toggle('translate-y-full');
    chat.classList.toggle('opacity-0');
    chat.classList.toggle('pointer-events-none');
};

window.sendChatMessage = async () => {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    const box = document.getElementById('chat-messages');
    box.innerHTML += `<div class="bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded-lg text-[11px] mb-2 self-end">User: ${msg}</div>`;
    input.value = "";
    box.innerHTML += `<div class="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-[11px] mb-2">AI: I can help you with components! Try asking "How do I add a Navbar?"</div>`;
    box.scrollTop = box.scrollHeight;
};

window.startVoicePrompt = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitRecognition;
    if (!SpeechRecognition) return alert("Voice recognition not supported.");
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    ui.voiceBtn.classList.add('animate-pulse', 'text-red-500');
    recognition.start();
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('user-prompt').value += (document.getElementById('user-prompt').value ? " " : "") + transcript;
        saveToLocal(projectState);
    };
    recognition.onend = () => ui.voiceBtn.classList.remove('animate-pulse', 'text-red-500');
};

// --- UI UTILS ---
window.toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
};

window.setViewport = (type) => {
    ui.previewContainer.style.width = type === 'mobile' ? '375px' : '100%';
};

window.switchPage = (name) => {
    projectState.currentPage = name;
    engine.renderTabs(projectState, ui.tabContainer);
    const code = projectState.pages[name] || "";
    const blob = new Blob([code], { type: 'text/html' });
    ui.preview.src = URL.createObjectURL(blob);
};

window.toggleCodeView = () => {
    const frame = document.getElementById('preview-frame');
    const editor = document.getElementById('code-editor-view');
    const btn = document.getElementById('code-view-toggle');
    if (editor.classList.contains('hidden')) {
        editor.value = projectState.pages[projectState.currentPage];
        editor.classList.remove('hidden');
        frame.classList.add('hidden');
        btn.innerText = "👁️ View Preview";
    } else {
        projectState.pages[projectState.currentPage] = editor.value;
        const blob = new Blob([editor.value], { type: 'text/html' });
        frame.src = URL.createObjectURL(blob);
        editor.classList.add('hidden');
        frame.classList.remove('hidden');
        btn.innerText = "💻 View Code";
        saveToLocal(projectState);
    }
};

window.openFullPreview = () => {
    const html = projectState.pages[projectState.currentPage];
    const newWin = window.open('about:blank', '_blank');
    newWin.document.write(html);
    newWin.document.close();
};

// --- IMAGE HANDLING ---
ui.imageInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    ui.imagePreview.innerHTML = '';
    projectState.attachedImages = [];
    for (const file of files) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result;
            projectState.attachedImages.push(base64);
            const wrapper = document.createElement('div');
            wrapper.className = "relative group";
            wrapper.innerHTML = `<img src="${base64}" onclick="window.zoomImage('${base64}')" class="w-12 h-12 object-cover rounded-lg">
                                 <button onclick="window.removeImage(${projectState.attachedImages.length - 1})" class="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full">✕</button>`;
            ui.imagePreview.appendChild(wrapper);
        };
        reader.readAsDataURL(file);
    }
});

window.removeImage = (index) => {
    projectState.attachedImages.splice(index, 1);
    ui.imagePreview.innerHTML = '';
    projectState.attachedImages.forEach((img, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = "relative group";
        wrapper.innerHTML = `<img src="${img}" onclick="window.zoomImage('${img}')" class="w-12 h-12 object-cover rounded-lg">
                             <button onclick="window.removeImage(${i})" class="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full">✕</button>`;
        ui.imagePreview.appendChild(wrapper);
    });
};

window.zoomImage = (src) => {
    const lightbox = document.getElementById('lightbox-modal');
    document.getElementById('lightbox-img').src = src;
    lightbox.classList.remove('hidden');
};

// --- AUTH & INIT ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "/login";
    } else {
        loadHistory(user, ui);
        updateUIUsage(user.uid, ui);
        if (projectState.id) loadProjectData(projectState.id, user.uid);
        else loadFromLocal();
    }
});

if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');
if (!projectState.id) generateUniqueProjectName(projectState, ui);

document.getElementById('user-prompt').addEventListener('input', () => saveToLocal(projectState));

// --- EXPORTED TRIGGERS ---
window.triggerDeploy = async () => {
    const slug = ui.slugInput.value.trim() || `site-${Date.now()}`;
    if (!projectState.id && auth.currentUser) {
        const prompt = document.getElementById('user-prompt').value;
        const projectResult = await autoSaveProject(projectState.pages, projectState.name, prompt, auth.currentUser.uid, ui.logs.innerHTML, projectState.currentPage);
        if (projectResult?.id) {
            projectState.id = projectResult.id;
            const url = new URL(window.location);
            url.searchParams.set('id', projectResult.id);
            window.history.pushState({}, '', url);
        }
    }
    if (!projectState.id) return alert("Error: Please generate content before publishing.");
    await deployer.deploy({ html: projectState.pages[projectState.currentPage], projectId: projectState.id, slug, auth, engine });
};

// --- EXTRA UI LOGIC ---
window.togglePublishModal = (show) => {
    ui.publishModal.classList.toggle('hidden', !show);
    if (show) window.generateSEOMetadata(); 
};

window.generateSEOMetadata = () => {
    const prompt = document.getElementById('user-prompt').value || "My Project";
    const titleInput = document.getElementById('seo-title');
    const descInput = document.getElementById('seo-description');
    if (titleInput) titleInput.value = prompt.split(' ').slice(0, 5).join(' ') + " | Built with AmmoueAI";
    if (descInput) descInput.value = `Explore this professional project: ${prompt}.`;
};

window.openDownloadModal = () => {
    const modal = document.getElementById('download-modal');
    const list = document.getElementById('download-file-list');
    if (!modal || !list) return; 
    const files = Object.keys(projectState.pages).map(name => name === 'landing' ? 'index.html' : `${name}.html`);
    list.innerHTML = files.map(f => `<div class="text-[11px] py-1 border-b dark:border-slate-800 flex justify-between"><span>📄 ${f}</span><span class="text-emerald-500">Ready</span></div>`).join('');
    modal.classList.remove('hidden');
};

window.confirmDownload = async () => {
    const { default: JSZip } = await import("https://cdn.skypack.dev/jszip");
    const zip = new JSZip();
    Object.entries(projectState.pages).forEach(([name, html]) => {
        zip.file(name === 'landing' ? 'index.html' : `${name}.html`, html);
    });
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `ammoueai-project-${Date.now()}.zip`;
    link.click();
    document.getElementById('download-modal').classList.add('hidden');
};

ui.preview.onload = () => {
    const frameDoc = ui.preview.contentDocument || ui.preview.contentWindow.document;
    frameDoc.querySelectorAll('h1, h2, h3, p, span, button, a').forEach(el => {
        el.contentEditable = "true";
        el.addEventListener('blur', () => {
            projectState.pages[projectState.currentPage] = frameDoc.documentElement.outerHTML;
            saveToLocal(projectState);
        });
    });
};
