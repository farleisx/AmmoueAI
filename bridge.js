// bridge.js
import { auth, getUsage, autoSaveProject, db } from "./fire_prompt.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, updateDoc, getDoc, collection, getDocs, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
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

import {
    updateFileTabsUI,
    displayActiveFile,
    updatePreview,
    updateSaveIndicator,
    showLoadingSkeleton,
    showActionLine
} from "./project_ui_service.js";

import {
    updateGenerateButtonToStop,
    resetGenerateButton,
    renderFileTabsFromRaw
} from "./generation_ui_service.js";

import { FrameBridge } from "./frame-bridge.js";

import { refreshFileState, loadExistingProject, handleRenameLogic } from "./project_management_service.js";
import { syncUsage, startCountdown } from "./usage_service.js";
import { initCommandPaletteLogic, handleGlobalKeyDown } from "./command_palette_service.js";
import { handleGitHubExport, handleOpenInTab } from "./export_service.js";

let currentUser = null;
let currentProjectId = null;
let projectFiles = {};
let activeFile = "index.html";
let recognition = null;
let abortController = null;
let isGenerating = false;
let currentUsageData = { count: 0, limit: 5, resetAt: 0 };

// Initialize Bridge for Frame
const bridge = new FrameBridge({
    frame: document.getElementById('preview-frame'),
    codeView: document.getElementById('code-editor'), // Or your specific code display element
    callbacks: {
        onSyncText: (syncId, content) => {
            // Future implementation for real-time text sync
        },
        onSwitchPage: (pageName) => {
            const fileName = pageName.endsWith('.html') ? pageName : `${pageName}.html`;
            if (projectFiles[fileName]) {
                window.switchFile(fileName);
            }
        }
    }
});

onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "/login";
    else { 
        currentUser = user; 
        syncUsageData(); 
        const urlParams = new URLSearchParams(window.location.search);
        const pid = urlParams.get('id');
        if (pid) loadProject(pid);
        fetchProjectHistory(currentUser, loadProject); 
    }
});

initUIService();
initAttachmentService('image-upload', 'attach-btn', 'attachment-rack', 'image-preview-modal', 'modal-img');
initLiveEditor(document.getElementById('preview-frame'));

async function syncUsageData() {
    const data = await syncUsage(currentUser);
    if (data) {
        if (currentUsageData.count !== data.count) {
            const creditEl = document.getElementById('credit-display');
            if (creditEl) {
                creditEl.classList.add('scale-110', 'text-emerald-400');
                setTimeout(() => creditEl.classList.remove('scale-110', 'text-emerald-400'), 400);
            }
        }
        currentUsageData = data;
        startCountdown(data.resetAt, updateCountdown, syncUsageData);
    }
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
        await handleRenameLogic(currentProjectId, currentUser, db, updateDoc, doc, renameRemoteProject, showCustomAlert);
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
        const redeployBtn = document.getElementById('redeploy-btn');

        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>`;
        lucide.createIcons();

        if(progressContainer) progressContainer.classList.remove('hidden');
        if(redeployBtn) redeployBtn.classList.add('hidden');
        
        const updateProgress = (pct, msg) => {
            if(progressBar) progressBar.style.width = `${pct}%`;
            if(progressText) progressText.innerText = msg;
        };

        let timerExpired = false;
        let finalDeploymentUrl = null;
        setTimeout(() => {
            timerExpired = true;
            if (finalDeploymentUrl) {
                btn.innerHTML = "See Deployment";
                btn.disabled = false;
                btn.onclick = () => window.open(finalDeploymentUrl, '_blank');
                if(redeployBtn) redeployBtn.classList.remove('hidden');
            }
        }, 30000);

        try {
            updateProgress(10, "Initializing deployment...");
            const idToken = await currentUser.getIdToken();
            updateProgress(30, "Optimizing assets...");
            
            projectFiles['vercel.json'] = JSON.stringify({ 
                "version": 2, 
                "cleanUrls": true, 
                "trailingSlash": false,
                "outputDirectory": "." 
            }, null, 2);

            // LOG RELAY INJECTION START
            const firebaseConfig = {
                apiKey: "AIzaSyAmnZ69YDcEFcmuXIhmGxDUSPULxpI-Bmg",
                authDomain: "ammoueai.firebaseapp.com",
                projectId: "ammoueai",
                storageBucket: "ammoueai.firebasestorage.app",
                messagingSenderId: "135818868149",
                appId: "1:135818868149:web:db9280baf9540a3339d5fc"
            };

            const relayScript = `
            <script type="module">
              import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
              import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
              const app = initializeApp(${JSON.stringify(firebaseConfig)});
              const db = getFirestore(app);
              const sendLog = async (msg) => {
                try { await addDoc(collection(db, "artifacts", "ammoueai", "projects", "${currentProjectId}", "live_logs"), {
                  message: msg, type: "error", timestamp: serverTimestamp()
                }); } catch(e) {}
              };
              window.onerror = (m, u, l, c, e) => sendLog(m + " at line " + l);
              const orig = console.error;
              console.error = (...args) => { sendLog(args.join(" ")); orig.apply(console, args); };
            </script>`;

            if (projectFiles['index.html']) {
                projectFiles['index.html'] = projectFiles['index.html'].replace('</head>', relayScript + '</head>');
            }
            // LOG RELAY INJECTION END

            updateProgress(50, "Uploading files to Vercel...");
            
            const deployResponse = await fetch('/api/deploy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ projectId: currentProjectId, slug, files: projectFiles })
            });

            if (!deployResponse.ok) {
                const errData = await deployResponse.json();
                if (deployResponse.status === 409) {
                    throw new Error("SLUG_TAKEN");
                } else if (deployResponse.status === 403) {
                    throw new Error("LIMIT_REACHED");
                } else {
                    throw new Error(errData.message || "Deployment failed");
                }
            }

            const res = await deployResponse.json();
            
            const deploymentId = res.id || res.deploymentId;
            let isReady = false;
            let attempts = 0;

            while (!isReady && attempts < 60) {
                const checkRes = await fetch(`/api/check-deployment?deploymentId=${deploymentId}`);
                const statusData = await checkRes.json();
                
                if (statusData.status === 'READY') {
                    isReady = true;
                    finalDeploymentUrl = `https://${slug}.vercel.app`;
                    updateProgress(100, "Site is live!");
                    
                    const linkArea = document.getElementById('deployment-link-area');
                    if(linkArea) {
                        linkArea.innerHTML = `<a href="${finalDeploymentUrl}" target="_blank" class="text-emerald-400 text-xs font-mono hover:underline flex items-center justify-center gap-1 mt-2"><i data-lucide="external-link" class="w-3 h-3"></i> ${finalDeploymentUrl}</a>`;
                        linkArea.classList.remove('hidden');
                        lucide.createIcons();
                    }
                    
                    const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
                    await updateDoc(projectRef, { lastDeploymentUrl: finalDeploymentUrl });

                    if (!timerExpired) {
                        setTimeout(() => {
                            window.open(finalDeploymentUrl, '_blank');
                            document.getElementById('publish-modal').style.display = 'none';
                            if(progressContainer) progressContainer.classList.add('hidden');
                            if(redeployBtn) redeployBtn.classList.remove('hidden');
                        }, 1000);
                    } else {
                        btn.innerHTML = "See Deployment";
                        btn.disabled = false;
                        btn.onclick = () => window.open(finalDeploymentUrl, '_blank');
                        if(redeployBtn) redeployBtn.classList.remove('hidden');
                    }
                } else if (statusData.status === 'ERROR' || statusData.status === 'FAILED') {
                    throw new Error("Vercel build failed.");
                } else {
                    attempts++;
                    const progressVal = Math.min(95, 50 + (attempts * 4));
                    updateProgress(progressVal, "Vercel is building your site...");
                    
                    finalDeploymentUrl = `https://${slug}.vercel.app`;

                    if (timerExpired && finalDeploymentUrl) {
                        btn.innerHTML = "See Deployment";
                        btn.disabled = false;
                        btn.onclick = () => window.open(finalDeploymentUrl, '_blank');
                        if(redeployBtn) redeployBtn.classList.remove('hidden');
                    }

                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        } catch (e) {
            if (e.message === "SLUG_TAKEN") {
                showCustomAlert("Name Conflict", "This URL slug is already taken by another project. Please try a different name.");
            } else if (e.message === "LIMIT_REACHED") {
                showCustomAlert("Limit Reached", "You've reached your deployment limit. Upgrade to Pro for unlimited sites.");
                document.getElementById('publish-modal').style.display = 'none';
                document.getElementById('checkout-modal').style.display = 'flex';
            } else {
                showCustomAlert("Publish Failed", e.message);
            }
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

if (document.getElementById('redeploy-btn')) {
    document.getElementById('redeploy-btn').onclick = () => {
        const confirmBtn = document.getElementById('confirm-publish');
        if (confirmBtn) {
            confirmBtn.innerHTML = "Deploy Now";
            confirmBtn.onclick = async () => { /* Logic repeated within handler above */ };
            confirmBtn.click();
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
        document.getElementById('code-sidebar').classList.remove('open');
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
            isGenerating = false;
            return;
        }
        const promptInput = document.getElementById('prompt-input');
        const prompt = promptInput ? promptInput.value : "";
        const idToken = await currentUser.getIdToken();
        isGenerating = true;
        abortController = new AbortController();
        updateGenerateButtonToStop();

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
                    projectFiles = renderFileTabsFromRaw(fullRawText, activeFile);
                    updateFileTabsUI(projectFiles, activeFile);
                    displayActiveFile(projectFiles, activeFile);
                    
                    if (projectFiles[activeFile]) {
                        bridge.update(projectFiles[activeFile]);
                    }
                },
                async (statusUpdate) => {
                    if (statusUpdate && statusUpdate.status === 'completed') {
                        await syncUsageData();
                        await refreshFiles();
                        resetGenerateButton();
                        isGenerating = false;
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
            isGenerating = false;
        }
        clearAttachments();
    };
}

window.switchFile = (fileName) => {
    activeFile = fileName;
    updateFileTabsUI(projectFiles, activeFile);
    displayActiveFile(projectFiles, activeFile);
    
    if (projectFiles[fileName]) {
        bridge.update(projectFiles[fileName]);
    }
};

async function refreshFiles() {
    projectFiles = await refreshFileState(currentProjectId, currentUser, updateFileTabsUI, displayActiveFile, activeFile, bridge);
}

async function loadProject(pid) {
    await loadExistingProject(pid, currentUser, async (id) => {
        currentProjectId = id;
        await refreshFiles();
    });
}

document.addEventListener('keydown', e => {
    handleGlobalKeyDown(e, 'generate-btn');
});

initCommandPaletteLogic(setPreviewSize);

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
        await handleGitHubExport(currentProjectId, currentUser, projectFiles, showCustomAlert);
    };
}

if (document.getElementById('open-tab-btn')) {
    document.getElementById('open-tab-btn').onclick = () => {
        handleOpenInTab(activeFile, projectFiles);
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

// SELF-HEALING LOGIC APPENDED
let logsUnsubscribe = null;

if (document.getElementById('toggle-logs')) {
    document.getElementById('toggle-logs').onclick = () => {
        const terminal = document.getElementById('logs-terminal');
        const frame = document.getElementById('preview-frame');
        const isHidden = terminal.style.display === 'none' || !terminal.style.display;
        terminal.style.display = isHidden ? 'flex' : 'none';
        frame.style.display = isHidden ? 'none' : 'block';
        if (isHidden && currentProjectId) {
            if (logsUnsubscribe) logsUnsubscribe();
            const logsRef = collection(db, "artifacts", "ammoueai", "projects", currentProjectId, "live_logs");
            const q = query(logsRef, orderBy("timestamp", "desc"), limit(50));
            logsUnsubscribe = onSnapshot(q, (snap) => {
                terminal.innerHTML = '';
                snap.docs.forEach(d => {
                    const l = d.data();
                    const entry = document.createElement('div');
                    entry.className = 'log-entry log-type-error';
                    const time = l.timestamp?.toDate().toLocaleTimeString() || '...';
                    entry.innerHTML = `
                        <span class="log-time">[${time}]</span>
                        <span class="log-msg">${l.message}</span>
                        <button class="ml-auto bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] hover:bg-emerald-500 hover:text-white transition flex items-center gap-1" onclick="window.selfHeal('${btoa(l.message)}')">
                            <i data-lucide="wand-2" class="w-2.5 h-2.5"></i> Fix
                        </button>`;
                    terminal.appendChild(entry);
                });
                lucide.createIcons();
            });
        }
    };
}

window.selfHeal = (b64) => {
    const msg = atob(b64);
    const input = document.getElementById('prompt-input');
    const terminal = document.getElementById('logs-terminal');
    const frame = document.getElementById('preview-frame');
    
    // Switch back to preview so user sees the change
    terminal.style.display = 'none';
    frame.style.display = 'block';
    
    input.value = `FIX ERROR: ${msg}. Please examine the code and repair the bug.`;
    document.getElementById('generate-btn').click();
};

// ---------------- SUPABASE BOOKING LOGIC ----------------
async function createBooking(business_id, service_id, customer_name, customer_email, booking_date, booking_time) {
    try {
        const res = await fetch('/api/bookings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                business_id,
                service_id,
                customer_name,
                customer_email,
                booking_date,
                booking_time
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Booking failed');
        return data;
    } catch (err) {
        console.error("Booking error:", err);
        showCustomAlert("Booking Error", err.message);
        return null;
    }
}

window.createBooking = createBooking;
