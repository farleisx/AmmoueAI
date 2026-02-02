// bridge.js
import { auth, getUsage, autoSaveProject, db } from "./fire_prompt.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, updateDoc, getDoc, collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { generateProjectStream } from "./generator_service.js";
import { deployProject, renameRemoteProject } from "./deployment_service.js";
import { downloadProjectFiles, listProjectFiles, generateCoolName } from "./download_service.js";
import { initAttachmentService, getAttachedImages, clearAttachments } from "./attachment_service.js";
import { initUIService, updateCountdown } from "./ui_service.js";
import { initLiveEditor } from "./editor_service.js";

let currentUser = null;
let currentProjectId = null;
let projectFiles = {};
let activeFile = "index.html";
let recognition = null;
let abortController = null;
let isGenerating = false;
let currentUsageData = { count: 0, limit: 5, resetAt: 0 };

onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "/login";
    else { 
        currentUser = user; 
        syncUsage(); 
        const urlParams = new URLSearchParams(window.location.search);
        const pid = urlParams.get('id');
        if (pid) loadExistingProject(pid);
        else fetchProjectHistory(); 
    }
});

// INITIALIZE ALL SERVICES
initUIService();
initAttachmentService('image-upload', 'attach-btn', 'attachment-rack', 'image-preview-modal', 'modal-img');
initLiveEditor(document.getElementById('preview-frame'));

async function syncUsage() {
    if (!currentUser) return;
    const usage = await getUsage(currentUser.uid);
    const plan = usage.plan === "pro" ? "pro" : "free";
    const limitVal = plan === "pro" ? 10 : 5;
    const count = usage.dailyCount || 0;
    const resetAt = usage.dailyResetAt || (Date.now() + 86400000);
    
    currentUsageData = { count, limit: limitVal, resetAt };
    
    const display = document.getElementById('credit-display');
    if (display) {
        display.innerText = `Credits: ${limitVal}/${count}`;
        if (count >= limitVal) {
            display.classList.add('text-red-500', 'bg-red-500/10');
            display.classList.remove('text-white/40', 'bg-white/5');
        } else {
            display.classList.remove('text-red-500', 'bg-red-500/10');
            display.classList.add('text-white/40', 'bg-white/5');
        }
    }
    startCountdown(resetAt);
}

function startCountdown(resetAt) {
    if (window.usageInterval) clearInterval(window.usageInterval);
    window.usageInterval = setInterval(() => {
        const now = Date.now();
        const timeLeft = Math.max(0, Math.floor((resetAt - now) / 1000));
        updateCountdown(timeLeft);
        if (timeLeft <= 0) syncUsage();
    }, 1000);
}

// DEVICE TOGGLE (FIXED UI LOGIC)
const setPreviewSize = (type) => {
    const container = document.getElementById('preview-container');
    const frame = document.getElementById('preview-frame');
    const btns = { desktop: 'view-desktop', tablet: 'view-tablet', mobile: 'view-mobile' };
    
    // Fix class swapping
    Object.values(btns).forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.remove('text-white', 'bg-white/10');
            btn.classList.add('text-gray-500');
        }
    });
    
    const activeBtn = document.getElementById(btns[type]);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-500');
        activeBtn.classList.add('text-white', 'bg-white/10');
    }

    if (type === 'desktop') { 
        container.style.maxWidth = '1100px'; 
        frame.style.width = '100%'; 
    }
    else if (type === 'tablet') { 
        container.style.maxWidth = '768px'; 
        frame.style.width = '768px'; 
    }
    else { 
        container.style.maxWidth = '375px'; 
        frame.style.width = '375px'; 
    }
};

if (document.getElementById('view-desktop')) document.getElementById('view-desktop').onclick = () => setPreviewSize('desktop');
if (document.getElementById('view-tablet')) document.getElementById('view-tablet').onclick = () => setPreviewSize('tablet');
if (document.getElementById('view-mobile')) document.getElementById('view-mobile').onclick = () => setPreviewSize('mobile');

// LOGOUT ACTION
if (document.getElementById('logout-btn')) {
    document.getElementById('logout-btn').onclick = () => signOut(auth);
}

// MODAL TOGGLES
if (document.getElementById('project-name-display')) {
    document.getElementById('project-name-display').onclick = () => {
        document.getElementById('rename-modal').style.display = 'flex';
    };
}

if (document.getElementById('publish-btn')) {
    document.getElementById('publish-btn').onclick = () => {
        document.getElementById('publish-modal').style.display = 'flex';
    };
}

// DOWNLOAD MODAL LOGIC
if (document.getElementById('download-btn')) {
    document.getElementById('download-btn').onclick = async () => {
        if (!currentProjectId) {
            showCustomAlert("Wait!", "Generate something before exporting code.");
            return;
        }
        
        const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
        const snap = await getDoc(projectRef);
        if (snap.exists()) {
            const filesData = snap.data().pages || {};
            const files = Object.keys(filesData);
            const listContainer = document.getElementById('file-list-display');
            listContainer.innerHTML = files.map(f => `<div class="flex items-center gap-2 text-gray-400 text-sm py-1"><i data-lucide="file-code" class="w-4 h-4 text-emerald-500"></i> ${f}</div>`).join('');
            lucide.createIcons();
        }
        
        document.getElementById('download-modal').style.display = 'flex';
    };
}

if (document.getElementById('confirm-download')) {
    document.getElementById('confirm-download').onclick = async () => {
        const btn = document.getElementById('confirm-download');
        btn.innerText = "Zipping...";
        await downloadProjectFiles(currentProjectId, currentUser.uid);
        btn.innerText = "Download ZIP";
        document.getElementById('download-modal').style.display = 'none';
    };
}

// RENAME ACTION (FIXED NULL PATH ERROR)
if (document.getElementById('confirm-rename')) {
    document.getElementById('confirm-rename').onclick = async () => {
        const newName = document.getElementById('new-project-name').value;
        if (!currentProjectId) {
            document.getElementById('rename-modal').style.display = 'none';
            showCustomAlert("Error", "No active project to rename. Start building first!");
            return;
        }
        const idToken = await currentUser.getIdToken();
        const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", String(currentProjectId));
        await updateDoc(projectRef, { projectName: newName });
        await renameRemoteProject(currentProjectId, idToken, newName);
        document.getElementById('project-name-display').innerText = newName;
        document.getElementById('rename-modal').style.display = 'none';
    };
}

// PUBLISH ACTION
if (document.getElementById('confirm-publish')) {
    document.getElementById('confirm-publish').onclick = async () => {
        const slug = document.getElementById('publish-slug').value;
        if (!currentProjectId) {
            document.getElementById('publish-modal').style.display = 'none';
            showCustomAlert("Hold on!", "You need to save or generate a project before publishing.");
            return;
        }
        const btn = document.getElementById('confirm-publish');
        const originalContent = btn.innerHTML;
        const progressContainer = document.getElementById('publish-progress-container');
        const progressBar = document.getElementById('publish-progress-bar');
        const progressText = document.getElementById('publish-progress-text');

        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>`;
        lucide.createIcons();

        if(progressContainer) progressContainer.classList.remove('hidden');
        
        const updateProgress = (pct, msg) => {
            if(progressBar) progressBar.style.width = `${pct}%`;
            if(progressText) progressText.innerText = msg;
        };

        try {
            updateProgress(10, "Initializing deployment...");
            const idToken = await currentUser.getIdToken();
            
            updateProgress(30, "Optimizing assets...");
            projectFiles['vercel.json'] = JSON.stringify({ 
                "version": 2, 
                "cleanUrls": true,
                "trailingSlash": false
            }, null, 2);

            updateProgress(50, "Uploading files to Vercel...");
            const res = await deployProject(currentProjectId, idToken, { slug, files: projectFiles });
            
            updateProgress(70, "Waiting for build completion...");
            
            // Poll for deployment status if available, otherwise artificial delay for propagation
            let ready = false;
            let attempts = 0;
            while(!ready && attempts < 10) {
                updateProgress(70 + (attempts * 2), "Verifying live status...");
                await new Promise(r => setTimeout(r, 2000));
                try {
                    const check = await fetch(res.deploymentUrl, { mode: 'no-cors' });
                    ready = true;
                } catch(e) {
                    attempts++;
                }
            }

            updateProgress(100, "Site is live!");
            
            // Show link persistent
            const linkArea = document.getElementById('deployment-link-area');
            if(linkArea) {
                linkArea.innerHTML = `<a href="${res.deploymentUrl}" target="_blank" class="text-emerald-400 text-xs font-mono hover:underline flex items-center justify-center gap-1 mt-2"><i data-lucide="external-link" class="w-3 h-3"></i> ${res.deploymentUrl}</a>`;
                linkArea.classList.remove('hidden');
                lucide.createIcons();
            }

            // Store in Firestore
            const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
            await updateDoc(projectRef, { lastDeploymentUrl: res.deploymentUrl });

            setTimeout(() => {
                window.open(res.deploymentUrl, '_blank');
                document.getElementById('publish-modal').style.display = 'none';
                if(progressContainer) progressContainer.classList.add('hidden');
            }, 1500);
        } catch (e) {
            showCustomAlert("Publish Failed", e.message);
            if(progressContainer) progressContainer.classList.add('hidden');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
            lucide.createIcons();
        }
    };
}

// CODE BUTTON TOGGLE FIX
if (document.getElementById('toggle-code')) {
    document.getElementById('toggle-code').onclick = () => {
        document.getElementById('code-sidebar').classList.toggle('open');
    };
}
if (document.getElementById('close-code')) {
    document.getElementById('close-code').onclick = () => {
        document.getElementById('code-sidebar').classList.remove('open');
    };
}

// GENERATE ACTION
if (document.getElementById('generate-btn')) {
    document.getElementById('generate-btn').onclick = async () => {
        if (currentUsageData.count >= currentUsageData.limit && !isGenerating) {
            const display = document.getElementById('credit-display');
            display.classList.add('animate-shake', 'brightness-150');
            setTimeout(() => display.classList.remove('animate-shake', 'brightness-150'), 500);
            document.getElementById('checkout-modal').style.display = 'flex';
            return;
        }

        if (isGenerating) {
            if (abortController) abortController.abort();
            resetGenerateButton();
            return;
        }

        const promptInput = document.getElementById('prompt-input');
        const prompt = promptInput ? promptInput.value : "";
        const idToken = await currentUser.getIdToken();
        
        isGenerating = true;
        abortController = new AbortController();
        updateGenerateButtonToStop();

        if (!currentProjectId) {
            const coolName = generateCoolName();
            currentProjectId = await autoSaveProject({}, prompt, null, currentUser.uid, "Start", "landing", coolName);
            const nameDisplay = document.getElementById('project-name-display');
            if (nameDisplay) nameDisplay.innerText = coolName;
        }
        
        const codeSidebar = document.getElementById('code-sidebar');
        if (codeSidebar) codeSidebar.classList.add('open');
        
        let fullRawText = "";
        
        try {
            await generateProjectStream(prompt, "vanilla", currentProjectId, idToken, 
                (chunk) => {
                    fullRawText += chunk;
                    renderFileTabsFromRaw(fullRawText);
                },
                async (statusUpdate) => {
                    // Fix: Only reset UI once the generation status is explicitly 'completed'
                    if (statusUpdate && statusUpdate.status === 'completed') {
                        await syncUsage();
                        await refreshFileState();
                        resetGenerateButton();
                    }
                },
                (file) => {
                    const status = document.getElementById('thinking-status');
                    if (status) status.innerText = `Architecting: ${file}`;
                    showActionLine(`Updated ${file}`);
                },
                abortController.signal
            );
        } catch (err) {
            showCustomAlert("Generation Error", err.message);
            const status = document.getElementById('thinking-status');
            if (status) status.innerText = "Error encountered.";
            resetGenerateButton();
        }
        clearAttachments();
    };
}

function showActionLine(text) {
    const container = document.getElementById('action-lines-container');
    if(!container) return;
    const line = document.createElement('div');
    line.className = "action-line text-[10px] text-white/40 font-mono bg-white/5 px-2 py-1 rounded-full whitespace-nowrap border border-white/5 flex items-center gap-1.5";
    line.innerHTML = `<span class="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span> ${text}`;
    container.appendChild(line);
    container.scrollLeft = container.scrollWidth;
    setTimeout(() => {
        line.style.opacity = '0';
        setTimeout(() => line.remove(), 500);
    }, 4000);
}

function updateGenerateButtonToStop() {
    const btn = document.getElementById('generate-btn');
    if (btn) {
        btn.innerHTML = `<i data-lucide="square" class="w-4 h-4 mr-2 fill-current"></i> Stop`;
        btn.classList.add('bg-red-500/10', 'text-red-500', 'border', 'border-red-500/20');
        btn.classList.remove('bg-[#ededed]', 'text-black');
        lucide.createIcons();
    }
}

function resetGenerateButton() {
    isGenerating = false;
    const btn = document.getElementById('generate-btn');
    if (btn) {
        btn.innerHTML = `Generate`;
        btn.classList.remove('bg-red-500/10', 'text-red-500', 'border', 'border-red-500/20');
        btn.classList.add('bg-[#ededed]', 'text-black');
    }
}

// MULTI-FILE HANDLER
function renderFileTabsFromRaw(rawText) {
    const fileMap = {};
    const regex = /\/\*\s*\[NEW_PAGE:\s*(.*?)\s*\]\s*\*\/([\s\S]*?)(?=\/\*\s*\[NEW_PAGE:|$)/g;
    let match;
    while ((match = regex.exec(rawText)) !== null) {
        const fileName = match[1].trim();
        const content = match[2].split(/\/\*\s*\[END_PAGE\]/)[0].trim();
        fileMap[fileName] = content;
    }
    
    projectFiles = fileMap;
    updateFileTabsUI();
    displayActiveFile();
}

function updateFileTabsUI() {
    const tabContainer = document.getElementById('file-tabs');
    if (!tabContainer) return;
    
    const files = Object.keys(projectFiles);
    tabContainer.innerHTML = files.map(f => `
        <button onclick="window.switchFile('${f}')" class="px-3 py-2 text-[11px] border-r border-white/5 whitespace-nowrap ${activeFile === f ? 'bg-white/5 text-white' : 'text-gray-500'} hover:text-white transition">
            ${f}
        </button>
    `).join('');
}

window.switchFile = (fileName) => {
    activeFile = fileName;
    updateFileTabsUI();
    displayActiveFile();
};

function displayActiveFile() {
    const output = document.getElementById('code-output');
    if (output) output.innerText = projectFiles[activeFile] || "";
    updatePreview();
}

function updatePreview() {
    const frame = document.getElementById('preview-frame');
    if (!frame) return;
    
    const content = projectFiles[activeFile] || "";
    // If we have content in index.html, render it immediately during generation
    if (!content && activeFile === "index.html") return;

    let blob;
    if (activeFile.endsWith('.html')) {
        blob = new Blob([content], { type: 'text/html' });
    } else {
        const escapedContent = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const formattedViewer = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { background: #0a0a0a; color: #a5b4fc; font-family: 'Geist Mono', monospace; padding: 24px; font-size: 13px; line-height: 1.6; }
                    .header { color: #4b5563; margin-bottom: 20px; font-size: 11px; border-bottom: 1px solid #1f2937; padding-bottom: 10px; }
                </style>
            </head>
            <body>
                <div class="header">// Viewing ${activeFile}</div>
                <pre>${escapedContent}</pre>
            </body>
            </html>
        `;
        blob = new Blob([formattedViewer], { type: 'text/html' });
    }

    const url = URL.createObjectURL(blob);
    frame.src = url;

    frame.onload = () => {
        if (!activeFile.endsWith('.html')) return;
        const doc = frame.contentDocument || frame.contentWindow.document;
        // Inject In-Preview Editing
        const style = doc.createElement('style');
        style.innerHTML = `[contenteditable="true"]:focus { outline: 2px solid #10b981; border-radius: 4px; }`;
        doc.head.appendChild(style);

        doc.body.querySelectorAll('h1, h2, h3, p, span, button, a').forEach(el => {
            el.contentEditable = "true";
            el.addEventListener('blur', () => {
                syncPreviewToCode(doc.documentElement.outerHTML);
            });
        });
    };
}

async function syncPreviewToCode(newHTML) {
    if (activeFile !== 'index.html') return; // Only sync back for main file for now
    projectFiles["index.html"] = newHTML;
    displayActiveFile();
    // Auto-save to DB
    if (currentProjectId && currentUser) {
        const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
        await updateDoc(projectRef, { 
            [`pages.index.html.content`]: newHTML,
            lastUpdated: Date.now()
        });
    }
}

async function refreshFileState() {
    if (!currentProjectId || !currentUser) return;
    const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
    const snap = await getDoc(projectRef);
    if (snap.exists()) {
        const data = snap.data().pages || {};
        projectFiles = {};
        Object.keys(data).forEach(k => {
            projectFiles[k] = data[k].content || "";
        });
        
        if (snap.data().lastDeploymentUrl) {
            const linkArea = document.getElementById('deployment-link-area');
            if(linkArea) {
                linkArea.innerHTML = `<a href="${snap.data().lastDeploymentUrl}" target="_blank" class="text-emerald-400 text-xs font-mono hover:underline flex items-center justify-center gap-1 mt-2"><i data-lucide="external-link" class="w-3 h-3"></i> ${snap.data().lastDeploymentUrl}</a>`;
                linkArea.classList.remove('hidden');
                lucide.createIcons();
            }
        }

        updateFileTabsUI();
        displayActiveFile();
    }
}

async function loadExistingProject(pid) {
    currentProjectId = pid;
    await refreshFileState();
    const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", pid);
    const snap = await getDoc(projectRef);
    if (snap.exists()) {
        document.getElementById('project-name-display').innerText = snap.data().projectName || "Untitled";
    }
}

// ALERT MODAL LOGIC
function showCustomAlert(title, message) {
    const t = document.getElementById('alert-title');
    const m = document.getElementById('alert-message');
    const mod = document.getElementById('alert-modal');
    if (t) t.innerText = title;
    if (m) m.innerText = message;
    if (mod) mod.style.display = 'flex';
}
if (document.getElementById('close-alert')) {
    document.getElementById('close-alert').onclick = () => {
        document.getElementById('alert-modal').style.display = 'none';
    };
}

// VOICE TO TEXT LOGIC
const voiceBtn = document.getElementById('voice-btn');
const promptInput = document.getElementById('prompt-input');

if (voiceBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        voiceBtn.classList.add('text-red-500', 'animate-pulse');
    };

    recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        if (promptInput) promptInput.value += (promptInput.value ? ' ' : '') + text;
    };

    recognition.onend = () => {
        voiceBtn.classList.remove('text-red-500', 'animate-pulse');
    };

    voiceBtn.onclick = () => {
        recognition.start();
    };
} else if (voiceBtn) {
    voiceBtn.style.display = 'none';
}

// NEW LOGIC: DASHBOARD NAVIGATION
if (document.getElementById('back-to-dashboard')) {
    document.getElementById('back-to-dashboard').onclick = () => {
        window.location.href = "/dashboard";
    };
}

// NEW LOGIC: TYPING EFFECTS
const typingPrompts = [
    "Build a neon dashboard for a crypto app...",
    "Create a clean landing page for a SaaS product...",
    "Design a brutalist portfolio for a developer...",
    "Generate a mobile-first social media interface...",
    "Architect a glassmorphic glass weather app..."
];

async function runTypingEffect() {
    const input = document.getElementById('prompt-input');
    if (!input) return;
    
    let promptIndex = 0;
    while (true) {
        let text = typingPrompts[promptIndex];
        for (let i = 0; i <= text.length; i++) {
            if (document.activeElement === input) { input.placeholder = "Edit your app..."; break; }
            input.placeholder = text.substring(0, i) + "|";
            await new Promise(r => setTimeout(r, 50));
        }
        await new Promise(r => setTimeout(r, 2000));
        for (let i = text.length; i >= 0; i--) {
            if (document.activeElement === input) { input.placeholder = "Edit your app..."; break; }
            input.placeholder = text.substring(0, i) + "|";
            await new Promise(r => setTimeout(r, 30));
        }
        promptIndex = (promptIndex + 1) % typingPrompts.length;
    }
}

// NEW LOGIC: Project History Sidebar
async function fetchProjectHistory() {
    if (!currentUser) return;
    const historyList = document.getElementById('project-history-list');
    if (!historyList) return;

    try {
        const q = query(
            collection(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects"),
            orderBy("lastUpdated", "desc"),
            limit(10)
        );
        const querySnapshot = await getDocs(q);
        historyList.innerHTML = "";
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const item = document.createElement('div');
            item.className = "p-2 hover:bg-white/5 rounded-lg cursor-pointer transition flex items-center gap-3 group";
            item.innerHTML = `
                <div class="w-8 h-8 bg-white/5 rounded-md flex items-center justify-center text-xs text-gray-400 group-hover:text-white">
                    <i data-lucide="file-code" class="w-4 h-4"></i>
                </div>
                <div class="flex-1 overflow-hidden">
                    <p class="text-[13px] text-gray-300 truncate font-medium group-hover:text-white">${data.projectName || 'Untitled'}</p>
                    <p class="text-[10px] text-gray-600 truncate">${data.lastUpdated ? new Date(parseInt(data.lastUpdated)).toLocaleDateString() : 'New'}</p>
                </div>
            `;
            item.onclick = () => { window.location.href = `/editor?id=${doc.id}`; };
            historyList.appendChild(item);
        });
        lucide.createIcons();
    } catch (e) {
        console.error("Error loading history", e);
    }
}

// CHECKOUT LOGIC
if (document.getElementById('checkout-pro-btn')) {
    document.getElementById('checkout-pro-btn').onclick = async () => {
        window.location.href = "/upgrade";
    };
}

// ADDITIVE LOGIC: Explorer Scroll Buttons
const explorerScroll = (direction) => {
    const tabs = document.getElementById('file-tabs');
    if (tabs) {
        const offset = direction === 'left' ? -150 : 150;
        tabs.scrollBy({ left: offset, behavior: 'smooth' });
    }
};

window.explorerScroll = explorerScroll;

document.addEventListener('DOMContentLoaded', () => {
    const nameDisplay = document.getElementById('project-name-display');
    if (nameDisplay && nameDisplay.innerText === 'lovable-clone') {
        nameDisplay.innerText = generateCoolName();
    }
    runTypingEffect();
});
