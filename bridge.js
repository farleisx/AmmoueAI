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
    renderFileTabsFromRaw,
    addAiActionLine,
    clearAiActions,
    toggleAiActionsFeed
} from "./generation_ui_service.js";

import { FrameBridge } from "./frame-bridge.js";

import { refreshFileState, loadExistingProject, handleRenameLogic, getShareableLink } from "./project_management_service.js";
import { syncUsage, startCountdown } from "./usage_service.js";
import { initCommandPaletteLogic, handleGlobalKeyDown } from "./command_palette_service.js";
import { handleGitHubExport, handleOpenInTab } from "./export_service.js";

// MODULAR SERVICE IMPORTS
import { initPreviewControls } from "./preview_control_service.js";
import { initProjectActions } from "./project_actions_service.js";
import { initDeploymentLogic, executeDeploymentFlow } from "./deployment_logic_service.js";
import { initMobileDrawer } from "./mobile_ui_service.js";
import { initSelfHealing } from "./self_healing_service.js";
import { handleGeneration } from "./generation_service_logic.js";

// REMIX SERVICE IMPORT
import { forkProject } from "./project_management_service.js";

let currentUser = null;
let currentProjectId = null;
let projectFiles = {};
let activeFile = "index.html";
let recognition = null;
let abortController = null;
let isGenerating = false;
let currentUsageData = { count: 0, limit: 5, resetAt: 0 };

// SAFETY NET STATE
let isUnsaved = false;
let saveDebounceTimer = null;

const bridge = new FrameBridge({
    frame: document.getElementById('preview-frame'),
    codeView: document.getElementById('code-editor'),
    callbacks: {
        onSyncText: (syncId, content) => {
            isUnsaved = true;
            if (projectFiles[activeFile] !== undefined) {
                projectFiles[activeFile] = content;
            }
            if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
            saveDebounceTimer = setTimeout(async () => {
                if (currentProjectId && currentUser) {
                    updateSaveIndicator('saving');
                    const savedId = await autoSaveProject(
                        projectFiles,
                        "", 
                        currentProjectId,
                        currentUser.uid,
                        "",
                        activeFile,
                        document.getElementById('project-name-display')?.innerText
                    );
                    if (savedId) {
                        updateSaveIndicator('saved');
                        isUnsaved = false;
                    }
                }
            }, 2000);
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

    frame.classList.remove('device-mobile', 'device-tablet');
    frame.style.transform = 'scale(1)';

    if (type === 'desktop') { 
        container.style.maxWidth = '1100px'; 
        frame.style.width = '100%'; 
        frame.style.height = '100%';
        frame.style.borderRadius = '0px';
    }
    else if (type === 'tablet') { 
        container.style.maxWidth = '100%'; 
        frame.style.width = '768px'; 
        frame.style.height = '1024px';
        frame.classList.add('device-tablet');
        
        const availableHeight = container.parentElement.clientHeight - 100;
        if (availableHeight < 1024) {
            const scale = availableHeight / 1024;
            frame.style.transform = `scale(${scale})`;
            frame.style.transformOrigin = 'top center';
        }
    }
    else { 
        container.style.maxWidth = '100%'; 
        frame.style.width = '393px'; 
        frame.style.height = '852px';
        frame.classList.add('device-mobile');

        const availableHeight = container.parentElement.clientHeight - 100;
        if (availableHeight < 852) {
            const scale = availableHeight / 852;
            frame.style.transform = `scale(${scale})`;
            frame.style.transformOrigin = 'top center';
        }
    }
};

if (document.getElementById('logout-btn')) {
    document.getElementById('logout-btn').onclick = () => signOut(auth);
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
        isUnsaved = true;
        const result = await handleGeneration({
            currentUser,
            currentProjectId,
            projectFiles,
            activeFile,
            isGenerating,
            currentUsageData,
            abortController,
            bridge,
            db,
            autoSaveProject,
            generateProjectStream,
            syncUsageData,
            refreshFiles
        });
        if (result) {
            currentProjectId = result.currentProjectId;
            projectFiles = result.projectFiles;
            isGenerating = result.isGenerating;
            abortController = result.abortController;
        }
        isUnsaved = false;
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

    document.getElementById('ai-protocol-btn')?.addEventListener('click', () => {
        toggleAiActionsFeed();
    });

    document.getElementById('clear-actions')?.addEventListener('click', (e) => {
        e.stopPropagation();
        clearAiActions();
    });

    initPreviewControls(setPreviewSize);
    initProjectActions({
        getProjectId: () => currentProjectId,
        getUser: () => currentUser,
        db,
        doc,
        getDoc,
        updateDoc,
        showCustomAlert,
        downloadProjectFiles,
        renameRemoteProject,
        handleRenameLogic,
        generateCoolName
    });
    initDeploymentLogic({
        getProjectId: () => currentProjectId,
        getUser: () => currentUser,
        getProjectFiles: () => projectFiles,
        db,
        doc,
        updateDoc,
        showCustomAlert,
        executeDeploymentFlow: () => executeDeploymentFlow({
            getProjectId: () => currentProjectId,
            getUser: () => currentUser,
            getProjectFiles: () => projectFiles,
            db,
            doc,
            updateDoc,
            showCustomAlert
        })
    });
    initMobileDrawer();
    initSelfHealing({
        getProjectId: () => currentProjectId,
        db,
        collection,
        query,
        orderBy,
        limit,
        onSnapshot
    });

    // FORK PROJECT HANDLER
    if (document.getElementById('remix-project-btn')) {
        document.getElementById('remix-project-btn').onclick = () => {
            forkProject({
                currentProjectId,
                currentUser,
                db,
                doc,
                getDoc,
                addDoc,
                collection,
                serverTimestamp,
                showCustomAlert
            });
        };
    }

    // SHARE PROJECT HANDLER
    if (document.getElementById('share-project-btn')) {
        document.getElementById('share-project-btn').onclick = () => {
            const link = getShareableLink(currentProjectId, currentUser?.uid);
            if (link) {
                navigator.clipboard.writeText(link);
                showCustomAlert("Link Copied", "Your shareable preview link is ready! Send it to anyone.");
            } else {
                showCustomAlert("Error", "Start a project first to get a shareable link.");
            }
        };
    }
});

async function createBooking(business_id, service_id, customer_name, customer_email, booking_date, booking_time) {
    try {
        const res = await fetch('/api/booking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_id, service_id, customer_name, customer_email, booking_date, booking_time })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Booking failed');
        return data;
    } catch (err) {
        showCustomAlert("Booking Error", err.message);
        return null;
    }
}
window.createBooking = createBooking;

// SAFETY NET LISTENER
window.addEventListener('beforeunload', (e) => {
    if (isUnsaved || isGenerating) {
        e.preventDefault();
        e.returnValue = '';
    }
});
