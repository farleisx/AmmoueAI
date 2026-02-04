// bridge.js
import { auth, getUsage, autoSaveProject, db } from "./fire_prompt.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, updateDoc, getDoc, collection, getDocs, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { generateProjectStream } from "./generator_service.js";
import { deployProject, renameRemoteProject } from "./deployment_service.js";
import { downloadProjectFiles, listProjectFiles, generateCoolName } from "./download_service.js";
import { initAttachmentService, getAttachedImages, clearAttachments } from "./attachment_service.js";
import { initUIService, updateCountdown } from "./ui_service.js";
import { initLiveEditor } from "./editor_service.js";

import { 
    showCustomAlert, 
    runTypingEffect, 
    initVoiceRecognition, 
    fetchProjectHistory, 
    explorerScroll 
} from "./bridge_ui.js";

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
        fetchProjectHistory(currentUser, loadExistingProject); 
    }
});

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
    
    // Animate credit counter decrement
    const creditEl = document.getElementById('credit-display');
    if (creditEl && currentUsageData.count !== count) {
        creditEl.classList.add('scale-110', 'text-emerald-400');
        setTimeout(() => creditEl.classList.remove('scale-110', 'text-emerald-400'), 400);
    }

    currentUsageData = { count, limit: limitVal, resetAt };
    
    if (creditEl) {
        creditEl.innerText = `Credits: ${limitVal}/${count}`;
        if (count >= limitVal && Date.now() < resetAt) {
            creditEl.classList.add('text-red-500', 'bg-red-500/10');
            creditEl.classList.remove('text-white/40', 'bg-white/5');
        } else {
            creditEl.classList.remove('text-red-500', 'bg-red-500/10');
            creditEl.classList.add('text-white/40', 'bg-white/5');
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

const setPreviewSize = (type) => {
    const container = document.getElementById('preview-container');
    const frame = document.getElementById('preview-frame');
    const btns = { desktop: 'view-desktop', tablet: 'view-tablet', mobile: 'view-mobile' };
    
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

if (document.getElementById('logout-btn')) {
    document.getElementById('logout-btn').onclick = () => signOut(auth);
}

if (document.getElementById('project-name-display')) {
    document.getElementById('project-name-display').onclick = () => {
        document.getElementById('rename-modal').style.display = 'flex';
    };
}

if (document.getElementById('publish-btn')) {
    document.getElementById('publish-btn').onclick = () => {
        const currentName = document.getElementById('project-name-display').innerText;
        const slugInput = document.getElementById('publish-slug');
        if (slugInput && currentName) {
            slugInput.value = currentName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        }
        document.getElementById('publish-modal').style.display = 'flex';
    };
}

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

if (document.getElementById('confirm-publish')) {
    document.getElementById('confirm-publish').onclick = async () => {
        const slugInput = document.getElementById('publish-slug');
        const projectNameDisplay = document.getElementById('project-name-display');
        const slug = (slugInput && slugInput.value) ? slugInput.value : (projectNameDisplay ? projectNameDisplay.innerText : null);
        
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

        // Timer for 30s fallback/see deployment
        let timerExpired = false;
        setTimeout(() => {
            timerExpired = true;
        }, 30000);

        try {
            updateProgress(10, "Initializing deployment...");
            const idToken = await currentUser.getIdToken();
            updateProgress(30, "Optimizing assets...");
            projectFiles['vercel.json'] = JSON.stringify({ "version": 2, "cleanUrls": true, "trailingSlash": false }, null, 2);
            updateProgress(50, "Uploading files to Vercel...");
            const res = await deployProject(currentProjectId, idToken, { slug, files: projectFiles });
            const deploymentId = res.id || res.deploymentId;
            let isReady = false;
            let attempts = 0;

            while (!isReady && attempts < 60) {
                const checkRes = await fetch(`/api/check-deployment?deploymentId=${deploymentId}`);
                const statusData = await checkRes.json();
                
                if (statusData.status === 'READY') {
                    isReady = true;
                    updateProgress(100, "Site is live!");
                    const linkArea = document.getElementById('deployment-link-area');
                    if(linkArea) {
                        linkArea.innerHTML = `<a href="${statusData.url}" target="_blank" class="text-emerald-400 text-xs font-mono hover:underline flex items-center justify-center gap-1 mt-2"><i data-lucide="external-link" class="w-3 h-3"></i> ${statusData.url}</a>`;
                        linkArea.classList.remove('hidden');
                        lucide.createIcons();
                    }
                    const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
                    await updateDoc(projectRef, { lastDeploymentUrl: statusData.url });
                    setTimeout(() => {
                        window.open(statusData.url, '_blank');
                        document.getElementById('publish-modal').style.display = 'none';
                        if(progressContainer) progressContainer.classList.add('hidden');
                    }, 1000);
                } else if (statusData.status === 'ERROR' || statusData.status === 'FAILED') {
                    throw new Error("Vercel build failed.");
                } else {
                    attempts++;
                    const progressVal = Math.min(95, 50 + (attempts * 4));
                    updateProgress(progressVal, "Vercel is building your site...");
                    
                    if (timerExpired) {
                        btn.innerHTML = "See Deployment";
                        btn.disabled = false;
                        btn.onclick = () => {
                           if(statusData.url) window.open(statusData.url, '_blank');
                        };
                    }

                    await new Promise(r => setTimeout(r, 1500));
                }
            }
        } catch (e) {
            showCustomAlert("Publish Failed", e.message);
            if(progressContainer) progressContainer.classList.add('hidden');
        } finally {
            if (!timerExpired) {
                btn.disabled = false;
                btn.innerHTML = originalContent;
                lucide.createIcons();
            }
        }
    };
}

if (document.getElementById('toggle-code')) {
    document.getElementById('toggle-code').onclick = () => {
        document.getElementById('code-sidebar').classList.toggle('open');
    };
}
if (document.getElementById('close-code')) {
    document.getElementById('close-code').onclick = () => {
        document.getElementById('code-sidebar').classList.remove('remove');
    };
}

if (document.getElementById('generate-btn')) {
    document.getElementById('generate-btn').onclick = async () => {
        const isCooldownOver = Date.now() >= currentUsageData.resetAt;
        if (currentUsageData.count >= currentUsageData.limit && !isGenerating && !isCooldownOver) {
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

        // Save status start
        updateSaveIndicator("Saving...");
        showLoadingSkeleton(true);
        const startTime = Date.now();

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
                    if (statusUpdate && statusUpdate.status === 'completed') {
                        await syncUsage();
                        await refreshFileState();
                        resetGenerateButton();
                        updateSaveIndicator("Saved");
                        showLoadingSkeleton(false);
                        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                        showActionLine(`Built in ${duration}s`);
                    }
                },
                (file) => {
                    const status = document.getElementById('thinking-status');
                    if (status) status.innerText = `Architecting: ${file}`;
                },
                abortController.signal
            );
        } catch (err) {
            showCustomAlert("Generation Error", err.message);
            const status = document.getElementById('thinking-status');
            if (status) status.innerText = "Error encountered.";
            updateSaveIndicator("Error saving");
            showLoadingSkeleton(false);
            resetGenerateButton();
        }
        clearAttachments();
    };
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
        btn.innerHTML = `<i data-lucide="rocket" class="rocket-icon w-4 h-4"></i> Generate`;
        btn.classList.remove('bg-red-500/10', 'text-red-500', 'border', 'border-red-500/20');
        btn.classList.add('bg-[#ededed]', 'text-black');
        lucide.createIcons();
    }
}

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
    if (!content && activeFile === "index.html") return;
    let blob;
    if (activeFile.endsWith('.html')) {
        let resolvedContent = content;
        Object.keys(projectFiles).forEach(fileName => {
            if (fileName !== activeFile) {
                const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const fileContent = projectFiles[fileName];
                const fileBlob = new Blob([fileContent], { type: 'text/html' });
                const fileUrl = URL.createObjectURL(fileBlob);
                resolvedContent = resolvedContent.replace(new RegExp(escapedFileName, 'g'), fileUrl);
            }
        });
        blob = new Blob([resolvedContent], { type: 'text/html' });
    } else {
        const escapedContent = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const formattedViewer = `<!DOCTYPE html><html><head><style>body { background: #0a0a0a; color: #a5b4fc; font-family: 'Geist Mono', monospace; padding: 24px; font-size: 13px; line-height: 1.6; }.header { color: #4b5563; margin-bottom: 20px; font-size: 11px; border-bottom: 1px solid #1f2937; padding-bottom: 10px; }</style></head><body><div class="header">// Viewing ${activeFile}</div><pre>${escapedContent}</pre></body></html>`;
        blob = new Blob([formattedViewer], { type: 'text/html' });
    }
    const url = URL.createObjectURL(blob);
    frame.src = url;
    
    // Preview Error Boundary and Polish
    frame.onload = () => {
        try {
            const frameDoc = frame.contentDocument || frame.contentWindow.document;
            const errorHandler = `
                window.onerror = function(msg, url, line) {
                    document.body.innerHTML = \`
                        <div style="background:#0a0a0a;color:#ef4444;padding:40px;font-family:monospace;height:100vh;">
                            <h2 style="font-size:18px;">Runtime Error</h2>
                            <p style="color:#666;font-size:14px;margin-top:10px;">\${msg}</p>
                            <p style="color:#444;font-size:12px;margin-top:20px;">Line: \${line}</p>
                        </div>\`;
                    return true;
                };
            `;
            const script = frameDoc.createElement('script');
            script.textContent = errorHandler;
            frameDoc.head.prepend(script);
        } catch(e) {}
    };
}

async function refreshFileState() {
    if (!currentProjectId || !currentUser) return;
    const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
    const snap = await getDoc(projectRef);
    if (snap.exists()) {
        const data = snap.data().pages || {};
        projectFiles = {};
        Object.keys(data).forEach(k => { projectFiles[k] = data[k].content || ""; });
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
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?id=' + pid;
        window.history.pushState({ path: newUrl }, '', newUrl);
    }
}

// Additive Helpers
function updateSaveIndicator(text) {
    const el = document.getElementById('save-status');
    if (el) el.innerText = text;
}

function showLoadingSkeleton(show) {
    const skeleton = document.getElementById('preview-skeleton');
    if (skeleton) skeleton.classList.toggle('hidden', !show);
}

function showActionLine(text) {
    const container = document.getElementById('action-lines-container');
    if (!container) return;
    const line = document.createElement('div');
    line.className = "action-line bg-white/5 border border-white/5 text-[10px] text-gray-400 px-3 py-1 rounded-full whitespace-nowrap";
    line.innerText = text;
    container.appendChild(line);
    setTimeout(() => line.remove(), 5000);
}

// Keyboard Listeners (Cmd+K, Enter)
document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const palette = document.getElementById('command-palette');
        palette.classList.toggle('hidden');
        if (!palette.classList.contains('hidden')) document.getElementById('command-input').focus();
    }
    if (e.key === 'Enter' && document.activeElement.id === 'prompt-input' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('generate-btn').click();
    }
});

// Command Palette Logic
if (document.getElementById('command-input')) {
    const cmds = [
        { label: 'Publish to Web', action: () => document.getElementById('publish-btn').click() },
        { label: 'Export ZIP', action: () => document.getElementById('download-btn').click() },
        { label: 'Rename Project', action: () => document.getElementById('project-name-display').click() },
        { label: 'Switch to Mobile View', action: () => setPreviewSize('mobile') },
        { label: 'Switch to Desktop View', action: () => setPreviewSize('desktop') },
        { label: 'Toggle Code', action: () => document.getElementById('toggle-code').click() },
        { label: 'Toggle Theme', action: () => document.getElementById('theme-toggle').click() }
    ];
    document.getElementById('command-input').oninput = (e) => {
        const val = e.target.value.toLowerCase();
        const results = cmds.filter(c => c.label.toLowerCase().includes(val));
        const resCont = document.getElementById('command-results');
        resCont.innerHTML = results.map((r, i) => `<div class="p-3 hover:bg-white/5 rounded-lg cursor-pointer transition cmd-item" data-idx="${i}">${r.label}</div>`).join('');
        document.querySelectorAll('.cmd-item').forEach(el => {
            el.onclick = () => {
                cmds[el.dataset.idx].action();
                document.getElementById('command-palette').classList.add('hidden');
            };
        });
    };
}

if (document.getElementById('theme-toggle')) {
    document.getElementById('theme-toggle').onclick = () => {
        document.body.classList.toggle('light-mode');
        const icon = document.getElementById('theme-toggle').querySelector('i');
        if (icon) {
            if (document.body.classList.contains('light-mode')) {
                icon.setAttribute('data-lucide', 'moon');
            } else {
                icon.setAttribute('data-lucide', 'sun');
            }
        }
        lucide.createIcons();
    };
}

window.explorerScroll = explorerScroll;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    initVoiceRecognition(recognition, document.getElementById('voice-btn'), document.getElementById('prompt-input'));
}

if (document.getElementById('close-alert')) {
    document.getElementById('close-alert').onclick = () => document.getElementById('alert-modal').style.display = 'none';
}

if (document.getElementById('back-to-dashboard')) {
    document.getElementById('back-to-dashboard').onclick = () => window.location.href = "/dashboard";
}

if (document.getElementById('checkout-pro-btn')) {
    document.getElementById('checkout-pro-btn').onclick = () => window.location.href = "/upgrade";
}

if (document.getElementById('export-github-btn')) {
    document.getElementById('export-github-btn').onclick = async () => {
        if (!currentProjectId) return;
        const btn = document.getElementById('export-github-btn');
        btn.disabled = true;
        btn.innerText = "Pushing...";
        const idToken = await currentUser.getIdToken();
        const userGitHubToken = localStorage.getItem('gh_access_token');
        const projectName = document.getElementById('project-name-display').innerText;

        if (!userGitHubToken) {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="github" class="w-4 h-4"></i> Push to GitHub`;
            lucide.createIcons();
            showCustomAlert("Auth Required", "Please log in with GitHub to use this feature.");
            return;
        }

        try {
            const res = await fetch('/api/github/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ projectId: currentProjectId, projectName, files: projectFiles, userGitHubToken })
            });
            const data = await res.json();
            if (data.repoUrl) {
                window.open(data.repoUrl, '_blank');
            } else {
                throw new Error(data.message || "Unknown error during export.");
            }
        } catch (e) { 
            showCustomAlert("GitHub Export Error", e.message); 
        }
        finally { btn.disabled = false; btn.innerHTML = `<i data-lucide="github" class="w-4 h-4"></i> Push to GitHub`; lucide.createIcons(); }
    };
}

if (document.getElementById('open-tab-btn')) {
    document.getElementById('open-tab-btn').onclick = () => {
        const content = projectFiles[activeFile] || "";
        const win = window.open('about:blank', '_blank');
        if (win) {
            win.document.write(activeFile.endsWith('.html') ? content : `<pre>${content}</pre>`);
            win.document.close();
        }
    };
}

if (document.getElementById('new-project-btn')) {
    document.getElementById('new-project-btn').onclick = () => {
        window.location.href = window.location.pathname;
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const nameDisplay = document.getElementById('project-name-display');
    if (nameDisplay && nameDisplay.innerText === 'lovable-clone') nameDisplay.innerText = generateCoolName();
    runTypingEffect();
});
