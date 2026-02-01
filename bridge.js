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
let projectPages = { landing: "" };
let recognition = null;

onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "/login";
    else { currentUser = user; syncUsage(); startCountdown(); fetchProjectHistory(); }
});

// INITIALIZE ALL SERVICES
initUIService();
initAttachmentService('image-upload', 'attach-btn', 'attachment-rack', 'image-preview-modal', 'modal-img');
initLiveEditor(document.getElementById('preview-frame'));

async function syncUsage() {
    if (!currentUser) return;
    const usage = await getUsage(currentUser.uid);
    document.getElementById('credit-display').innerText = `Credits: ${usage.dailyCount || 0}`;
}

function startCountdown() {
    let timeLeft = 3600 * 24; // Example 24h reset
    setInterval(() => {
        timeLeft--;
        updateCountdown(timeLeft);
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
            const files = listProjectFiles(snap.data().pages || {});
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
        const idToken = await currentUser.getIdToken();
        const res = await deployProject(currentProjectId, idToken, { slug });
        window.open(res.deploymentUrl, '_blank');
        document.getElementById('publish-modal').style.display = 'none';
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
        const promptInput = document.getElementById('prompt-input');
        const prompt = promptInput ? promptInput.value : "";
        const idToken = await currentUser.getIdToken();
        if (!currentProjectId) {
            const coolName = generateCoolName();
            currentProjectId = await autoSaveProject(projectPages, prompt, null, currentUser.uid, "Start", "landing", coolName);
            const nameDisplay = document.getElementById('project-name-display');
            if (nameDisplay) nameDisplay.innerText = coolName;
        }
        
        const codeSidebar = document.getElementById('code-sidebar');
        if (codeSidebar) codeSidebar.classList.add('open');
        const codeOutput = document.getElementById('code-output');
        if (codeOutput) codeOutput.innerText = ""; 
        
        try {
            await generateProjectStream(prompt, "vanilla", currentProjectId, idToken, 
                (chunk) => {
                    const out = document.getElementById('code-output');
                    if (out) out.innerText += chunk;
                    const frame = document.getElementById('preview-frame');
                    if (frame && out) {
                        frame.srcdoc = out.innerText;
                    }
                },
                () => syncUsage(),
                (file) => {
                    const status = document.getElementById('thinking-status');
                    if (status) status.innerText = `Architecting: ${file}`;
                }
            );
        } catch (err) {
            showCustomAlert("Generation Error", err.message);
            const status = document.getElementById('thinking-status');
            if (status) status.innerText = "Error encountered.";
        }
        clearAttachments();
    };
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
        // Type forward
        for (let i = 0; i <= text.length; i++) {
            if (document.activeElement === input) { input.placeholder = "Edit your app..."; break; }
            input.placeholder = text.substring(0, i) + "|";
            await new Promise(r => setTimeout(r, 50));
        }
        await new Promise(r => setTimeout(r, 2000));
        // Type backward
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
            orderBy("lastSaved", "desc"),
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
                    <p class="text-[10px] text-gray-600 truncate">${new Date(data.lastSaved?.toDate()).toLocaleDateString()}</p>
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

document.addEventListener('DOMContentLoaded', () => {
    // Set initial project name
    const nameDisplay = document.getElementById('project-name-display');
    if (nameDisplay && nameDisplay.innerText === 'lovable-clone') {
        nameDisplay.innerText = generateCoolName();
    }
    runTypingEffect();
});
