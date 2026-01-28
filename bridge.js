import { auth, db, autoSaveProject, getUserProjects } from "./fire_prompt.js";
import { GenerationEngine } from "./generation-engine.js";
import { DeploymentManager } from "./deployment-manager.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { initPromptTyping } from "./prompt-typing.js"; 

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
    voiceBtn: document.getElementById('voice-btn')
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

// --- NEW PROJECT LOGIC ---
window.createNewProject = () => {
    const url = new URL(window.location);
    url.searchParams.delete('id');
    window.history.pushState({}, '', url);
    location.reload(); 
};

// --- LIVE CHAT LOGIC ---
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

// --- PROMPT SUGGESTIONS LOGIC ---
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
};

// --- VOICE PROMPT LOGIC ---
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
    };
    recognition.onerror = () => ui.voiceBtn.classList.remove('animate-pulse', 'text-red-500');
    recognition.onend = () => ui.voiceBtn.classList.remove('animate-pulse', 'text-red-500');
};

// --- DOWNLOAD CODE LOGIC ---
window.openDownloadModal = () => {
    const modal = document.getElementById('download-modal');
    const list = document.getElementById('download-file-list');
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

// --- COLLABORATION LOGIC ---
window.copyCollaborationLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('collab-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = "Copied!";
        setTimeout(() => btn.innerHTML = originalText, 2000);
    });
};

// --- AI STYLE PRESETS LOGIC ---
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

// --- AI SEO METADATA LOGIC ---
window.generateSEOMetadata = () => {
    const prompt = document.getElementById('user-prompt').value || "My Awesome Project";
    const titleInput = document.getElementById('seo-title');
    const descInput = document.getElementById('seo-description');
    
    // Simple logic to simulate AI suggestion based on user prompt
    const suggestedTitle = prompt.split(' ').slice(0, 5).join(' ') + " | Built with AmmoueAI";
    const suggestedDesc = `Explore this professional project: ${prompt}. Created using advanced AI design tools for a seamless user experience.`;
    
    titleInput.value = suggestedTitle;
    descInput.value = suggestedDesc;
};

// --- ONE-CLICK FAVICON LOGIC ---
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
    if (show) window.generateSEOMetadata(); // Generate SEO when modal opens
};

ui.slugInput?.addEventListener('input', (e) => {
    document.getElementById('slug-preview').innerText = (e.target.value || 'my-awesome-website') + '.vercel.app';
});

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
    if (ui.progressBar) ui.progressBar.classList.remove('hidden');
    
    // Add to Revision History
    window.saveRevision(projectState.pages[projectState.currentPage]);
    
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

// --- NEW COMPONENT LIBRARY LOGIC ---
window.addComponentToPrompt = (compName) => {
    const promptArea = document.getElementById('user-prompt');
    const addition = `\n[Add ${compName} component with modern styling]`;
    promptArea.value += addition;
    promptArea.scrollTop = promptArea.scrollHeight;
};

// --- UNIQUE PROJECT NAMING LOGIC ---
window.generateUniqueProjectName = () => {
    const adjectives = ["Velvet", "Neon", "Golden", "Silent", "Cosmic", "Swift", "Azure", "Emerald"];
    const nouns = ["Pulse", "Nebula", "Flow", "Sphere", "Nexus", "Drift", "Aura", "Beacon"];
    const name = adjectives[Math.floor(Math.random() * adjectives.length)] + " " + nouns[Math.floor(Math.random() * nouns.length)];
    
    const nameDisplay = document.getElementById('project-name-display');
    if (nameDisplay) nameDisplay.innerText = name;
    
    // Apply to domain slug also
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    if (ui.slugInput) {
        ui.slugInput.value = slug;
        document.getElementById('slug-preview').innerText = slug + '.vercel.app';
    }
    
    return name;
};

// Initialize name on load if it's a new project
if (!projectState.id) {
    window.generateUniqueProjectName();
}

// --- REVISION HISTORY LOGIC ---
const revisions = [];
window.saveRevision = (html) => {
    if (!html) return;
    revisions.push(html);
    const slider = document.getElementById('revision-slider');
    if (slider) {
        slider.max = revisions.length - 1;
        slider.value = slider.max;
    }
    const countDisplay = document.getElementById('rev-count');
    if (countDisplay) countDisplay.innerText = revisions.length;
};

window.scrubRevision = (index) => {
    const html = revisions[index];
    if (html) {
        const blob = new Blob([html], { type: 'text/html' });
        ui.preview.src = URL.createObjectURL(blob);
    }
};

window.restoreRevision = () => {
    const index = document.getElementById('revision-slider').value;
    const html = revisions[index];
    if (html) {
        projectState.pages[projectState.currentPage] = html;
        alert("Revision restored!");
    }
};

// --- IMAGE UTILITY LOGIC ---
window.removeImage = (index) => {
    projectState.attachedImages.splice(index, 1);
    // Refresh the preview UI
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

// --- MOBILE NAVIGATION & UI VIEW LOGIC ---
window.toggleMobileView = (view) => {
    const sidebar = document.querySelector('aside');
    const leftPanel = document.querySelector('.lg\\:w-80');
    const centerPanel = document.querySelector('.flex-1.flex.flex-col.min-w-0');
    
    sidebar.classList.add('hidden');
    leftPanel.classList.add('hidden');
    centerPanel.classList.add('hidden');
    
    if (view === 'sidebar') sidebar.classList.remove('hidden');
    if (view === 'prompt') leftPanel.classList.remove('hidden');
    if (view === 'preview') centerPanel.classList.remove('hidden');
};

// --- LIVE TEXT SYNC & CODE VIEWER LOGIC ---
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
        });
    });
};

ui.preview.onload = () => window.enableVisualEditing();
