import { auth, db, autoSaveProject, getUserProjects, getUsage } from "./fire_prompt.js";
import { GenerationEngine } from "./generation-engine.js";
import { DeploymentManager } from "./deployment-manager.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { initPromptTyping } from "./prompt-typing.js"; 

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
            saveToLocal();
        },
        onNewPage: (name) => {
            if (!projectState.pages[name]) projectState.pages[name] = "";
            engine.renderTabs(projectState, ui.tabContainer);
            saveToLocal();
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

// --- CREDIT & USAGE UPDATE ---
async function updateUIUsage(userId) {
    if (!userId) return;
    const usage = await getUsage(userId);
    const limit = usage.plan === "pro" ? 10 : 5;
    const remaining = Math.max(0, limit - (usage.dailyCount || 0));
    
    if (ui.creditDisplay) {
        ui.creditDisplay.innerText = `${remaining}/${limit} Credits Left`;
    }
    
    if (ui.resetDisplay && usage.dailyResetAt) {
        startResetCountdown(usage.dailyResetAt);
    }
}

function startResetCountdown(resetAtMs) {
    const update = () => {
        const now = Date.now();
        const diffMs = resetAtMs - now;

        if (diffMs <= 0) {
            ui.resetDisplay.innerText = `Resetting now...`;
            return;
        }

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        // Simple display
        ui.resetDisplay.innerText = `Resets in ${hours}h`;
        
        // Full precision on hover
        ui.resetDisplay.title = `Exact Reset in: ${hours}h ${minutes}m ${seconds}s`;
    };
    
    update();
    setInterval(update, 1000);
}

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
                        if (data.status === "initializing") updateUIUsage(auth.currentUser.uid);
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
        saveToLocal();
        loadHistory(auth.currentUser);
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

// --- REMAINDER OF EXISTING LOGIC ---
window.createNewProject = () => {
    localStorage.removeItem('ammoue_autosave');
    const url = new URL(window.location);
    url.searchParams.delete('id');
    window.history.pushState({}, '', url);
    location.reload(); 
};

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

const suggestions = [
    "A minimalist portfolio for a creative director",
    "A high-converting SaaS landing page",
    "A luxury coffee shop website with a menu",
    "A dark-themed crypto dashboard UI",
    "An elegant wedding invitation page"
];

initPromptTyping(document.getElementById('user-prompt'), suggestions);

window.applySuggestion = (text) => {
    document.getElementById('user-prompt').value = text;
    saveToLocal();
};

window.startVoicePrompt = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitRecognition;
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
        saveToLocal();
    };
    recognition.onerror = () => ui.voiceBtn.classList.remove('animate-pulse', 'text-red-500');
    recognition.onend = () => ui.voiceBtn.classList.remove('animate-pulse', 'text-red-500');
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
        const fileName = name === 'landing' ? 'index.html' : `${name}.html`;
        zip.file(fileName, html);
    });
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `ammoueai-project-${Date.now()}.zip`;
    link.click();
    document.getElementById('download-modal').classList.add('hidden');
};

window.copyCollaborationLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('collab-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = "Copied!";
        setTimeout(() => btn.innerHTML = originalText, 2000);
    });
};

window.applyStylePreset = (preset) => {
    const styles = {
        modern: { font: "'Inter', sans-serif", primary: "#4f46e5", bg: "#ffffff" },
        midnight: { font: "'Space Grotesk', sans-serif", primary: "#06b6d4", bg: "#020617" },
        neon: { font: "'Outfit', sans-serif", primary: "#f472b6", bg: "#0f172a" },
        classic: { font: "'Playfair Display', serif", primary: "#1e293b", bg: "#f8fafc" }
    };
    const selection = styles[preset];
    const frame = document.getElementById('preview-frame');
    if (frame.contentDocument) {
        const styleTag = frame.contentDocument.createElement('style');
        styleTag.innerHTML = `
            :root { --primary: ${selection.primary}; --bg: ${selection.bg}; }
            body { font-family: ${selection.font} !important; }
        `;
        frame.contentDocument.head.appendChild(styleTag);
    }
};

window.generateSEOMetadata = () => {
    const prompt = document.getElementById('user-prompt').value || "My Awesome Project";
    const titleInput = document.getElementById('seo-title');
    const descInput = document.getElementById('seo-description');
    
    const suggestedTitle = prompt.split(' ').slice(0, 5).join(' ') + " | Built with AmmoueAI";
    const suggestedDesc = `Explore this professional project: ${prompt}. Created using advanced AI design tools for a seamless user experience.`;
    
    if (titleInput) titleInput.value = suggestedTitle;
    if (descInput) descInput.value = suggestedDesc;
};

window.setProjectFavicon = (emoji) => {
    const canvas = document.createElement('canvas');
    canvas.height = 64;
    canvas.width = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '54px serif';
    ctx.fillText(emoji, 0, 54);
    const dataUri = canvas.toDataURL();
    const frame = document.getElementById('preview-frame');
    if (frame.contentDocument) {
        let link = frame.contentDocument.querySelector("link[rel~='icon']");
        if (!link) {
            link = frame.contentDocument.createElement('link');
            link.rel = 'icon';
            frame.contentDocument.head.appendChild(link);
        }
        link.href = dataUri;
        document.getElementById('current-favicon-display').innerText = emoji;
    }
};

window.toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
};

if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark');
}

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "/login";
    } else {
        loadHistory(user);
        updateUIUsage(user.uid);
        if (projectState.id) {
            loadProjectData(projectState.id, user.uid);
        } else {
            loadFromLocal();
        }
    }
});

window.setViewport = (type) => {
    if (type === 'mobile') {
        ui.previewContainer.style.width = '375px';
    } else {
        ui.previewContainer.style.width = '100%';
    }
};

window.togglePublishModal = (show) => {
    ui.publishModal.classList.toggle('hidden', !show);
    if (show) window.generateSEOMetadata(); 
};

ui.slugInput?.addEventListener('input', (e) => {
    document.getElementById('slug-preview').innerText = (e.target.value || 'my-awesome-website') + '.vercel.app';
});

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

function saveToLocal() {
    const data = {
        prompt: document.getElementById('user-prompt').value,
        pages: projectState.pages,
        id: projectState.id,
        name: projectState.name
    };
    localStorage.setItem('ammoue_autosave', JSON.stringify(data));
}

function loadFromLocal() {
    const saved = localStorage.getItem('ammoue_autosave');
    if (!saved) return;
    const data = JSON.parse(saved);
    if (data.id && data.id !== projectState.id) return;
    document.getElementById('user-prompt').value = data.prompt || "";
    projectState.pages = data.pages || { landing: "" };
    projectState.name = data.name || ui.nameDisplay.innerText;
    ui.nameDisplay.innerText = projectState.name;
    engine.renderTabs(projectState, ui.tabContainer);
    window.switchPage(projectState.currentPage);
}

document.getElementById('user-prompt').addEventListener('input', saveToLocal);

async function loadHistory(user) {
    if (!user) return;
    const projects = await getUserProjects(user.uid);
    ui.historyList.innerHTML = projects.map(p => `
        <div onclick="window.loadProject('${p.id}')" class="p-3 mb-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer border border-slate-200 dark:border-slate-700 transition-all group">
            <div class="text-[11px] font-bold truncate text-slate-800 dark:text-slate-200">${p.projectName || p.prompt || 'Untitled'}</div>
            <div class="text-[9px] text-slate-400 group-hover:text-indigo-500">${new Date(p.updatedAt?.seconds * 1000).toLocaleDateString()}</div>
        </div>
    `).join('');
}

window.loadProject = (id) => {
    localStorage.removeItem('ammoue_autosave');
    const url = new URL(window.location);
    url.searchParams.set('id', id);
    window.history.pushState({}, '', url);
    projectState.id = id;
    loadProjectData(id, auth.currentUser.uid);
};

ui.imageInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    ui.imagePreview.innerHTML = '';
    projectState.attachedImages = [];
    for (const file of files) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result;
            const index = projectState.attachedImages.length;
            projectState.attachedImages.push(base64);
            
            const wrapper = document.createElement('div');
            wrapper.className = "relative group cursor-pointer";
            wrapper.innerHTML = `
                <img src="${base64}" onclick="window.zoomImage('${base64}')" class="w-12 h-12 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-transform hover:scale-105">
                <button onclick="window.removeImage(${index})" class="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
            `;
            ui.imagePreview.appendChild(wrapper);
        };
        reader.readAsDataURL(file);
    }
});

window.switchPage = (name) => {
    projectState.currentPage = name;
    engine.renderTabs(projectState, ui.tabContainer);
    const code = projectState.pages[name] || "";
    const blob = new Blob([code], { type: 'text/html' });
    ui.preview.src = URL.createObjectURL(blob);
};

window.stopGeneration = async () => {
    if (!projectState.isGenerating) return;
    engine.stop();
    projectState.isGenerating = false;
    ui.genBtn.classList.remove('gen-active');
    ui.genBtn.innerHTML = '➤';
    ui.stopBtn.classList.add('hidden');
    saveToLocal();
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

window.generateUniqueProjectName = () => {
    const adjectives = ["Velvet", "Neon", "Golden", "Silent", "Cosmic", "Swift", "Azure", "Emerald"];
    const nouns = ["Pulse", "Nebula", "Flow", "Sphere", "Nexus", "Drift", "Aura", "Beacon"];
    const name = adjectives[Math.floor(Math.random() * adjectives.length)] + " " + nouns[Math.floor(Math.random() * nouns.length)];
    projectState.name = name;
    if (ui.nameDisplay) ui.nameDisplay.innerText = name;
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    if (ui.slugInput) {
        ui.slugInput.value = slug;
        document.getElementById('slug-preview').innerText = slug + '.vercel.app';
    }
    return name;
};

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
        saveToLocal();
        syncNameWithFirebase(projectState.name);
        document.getElementById('rename-modal').classList.add('hidden');
    }
};

async function syncNameWithFirebase(newName) {
    if (!projectState.id || !auth.currentUser) return;
    try {
        const docRef = doc(db, "artifacts", "ammoueai", "users", auth.currentUser.uid, "projects", projectState.id);
        await updateDoc(docRef, { projectName: newName });
    } catch (e) { console.error("Name sync failed:", e); }
}

if (!projectState.id) {
    window.generateUniqueProjectName();
}

window.removeImage = (index) => {
    projectState.attachedImages.splice(index, 1);
    ui.imagePreview.innerHTML = '';
    projectState.attachedImages.forEach((base64, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = "relative group cursor-pointer";
        wrapper.innerHTML = `
            <img src="${base64}" onclick="window.zoomImage('${base64}')" class="w-12 h-12 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-transform hover:scale-105">
            <button onclick="window.removeImage(${i})" class="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
        `;
        ui.imagePreview.appendChild(wrapper);
    });
};

window.zoomImage = (src) => {
    const lightbox = document.getElementById('lightbox-modal');
    document.getElementById('lightbox-img').src = src;
    lightbox.classList.remove('hidden');
};

window.toggleMobileView = (view) => {
    const sidebar = document.getElementById('main-sidebar');
    const leftPanel = document.getElementById('prompt-container');
    const centerPanel = document.getElementById('preview-container');
    const fab = document.getElementById('mobile-fab');
    sidebar.classList.add('hidden');
    leftPanel.classList.add('hidden');
    centerPanel.classList.add('hidden');
    sidebar.classList.remove('sidebar-mobile');
    leftPanel.classList.remove('prompt-zone-mobile');
    if (view === 'sidebar') {
        sidebar.classList.remove('hidden');
        sidebar.classList.add('sidebar-mobile');
        if(fab) fab.classList.add('hidden');
    } else if (view === 'prompt') {
        leftPanel.classList.remove('hidden');
        leftPanel.classList.add('prompt-zone-mobile');
        if(fab) fab.classList.remove('hidden');
    } else if (view === 'preview') {
        centerPanel.classList.remove('hidden');
        if(fab) fab.classList.remove('hidden');
    }
};

let touchStartX = 0;
const sidebarEl = document.getElementById('main-sidebar');
sidebarEl.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
sidebarEl.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    if (touchStartX - touchEndX > 50 && sidebarEl.classList.contains('sidebar-mobile')) {
        window.toggleMobileView('preview');
    }
}, { passive: true });

let lastScrollY = 0;
const scrollTarget = document.querySelector('section'); 
scrollTarget.addEventListener('scroll', () => {
    if (window.innerWidth > 1024) return;
    const currentScrollY = scrollTarget.scrollTop;
    if (currentScrollY > lastScrollY && currentScrollY > 60) {
        ui.header.classList.add('-translate-y-full');
    } else {
        ui.header.classList.remove('-translate-y-full');
    }
    lastScrollY = currentScrollY;
}, { passive: true });

document.addEventListener('touchstart', (e) => {
    const target = e.target.closest('button, a, .emoji-btn, #mobile-fab');
    if (target) target.classList.add('haptic-press');
}, { passive: true });
document.addEventListener('touchend', (e) => {
    const target = e.target.closest('button, a, .emoji-btn, #mobile-fab');
    if (target) target.classList.remove('haptic-press');
}, { passive: true });

let refreshStartY = 0;
const previewWrapper = document.getElementById('preview-wrapper');
const refreshIndicator = document.getElementById('refresh-indicator');
previewWrapper.addEventListener('touchstart', (e) => { if (window.innerWidth > 1024) return; refreshStartY = e.touches[0].pageY; }, { passive: true });
previewWrapper.addEventListener('touchmove', (e) => {
    if (window.innerWidth > 1024) return;
    const currentY = e.touches[0].pageY;
    const diff = currentY - refreshStartY;
    if (diff > 50 && diff < 150) {
        refreshIndicator.style.transform = `translateY(${diff - 60}px)`;
        refreshIndicator.classList.remove('hidden');
    }
}, { passive: true });
previewWrapper.addEventListener('touchend', async (e) => {
    if (window.innerWidth > 1024) return;
    const diff = e.changedTouches[0].pageY - refreshStartY;
    if (diff > 100) {
        refreshIndicator.classList.add('animate-spin');
        await window.triggerGenerate();
        setTimeout(() => {
            refreshIndicator.classList.add('hidden');
            refreshIndicator.classList.remove('animate-spin');
        }, 1000);
    } else { refreshIndicator.classList.add('hidden'); }
}, { passive: true });

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
        saveToLocal();
    }
};

window.enableVisualEditing = () => {
    const frame = document.getElementById('preview-frame');
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.querySelectorAll('h1, h2, h3, p, span, button, a').forEach(el => {
        el.contentEditable = "true";
        el.style.outline = "none";
        el.addEventListener('blur', () => {
            projectState.pages[projectState.currentPage] = doc.documentElement.outerHTML;
            saveToLocal();
        });
    });
};
ui.preview.onload = () => window.enableVisualEditing();

window.openFullPreview = () => {
    const html = projectState.pages[projectState.currentPage];
    const newWin = window.open('about:blank', '_blank');
    newWin.document.write(html);
    newWin.document.close();
};
