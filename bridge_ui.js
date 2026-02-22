// bridge_ui.js
import { db } from "./fire_prompt.js";
import { collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// ALERT MODAL LOGIC
export function showCustomAlert(title, message) {
    const t = document.getElementById('alert-title');
    const m = document.getElementById('alert-message');
    const mod = document.getElementById('alert-modal');
    if (t) t.innerText = title;
    if (m) m.innerText = message;
    if (mod) mod.style.display = 'flex';
}

// TYPING EFFECTS
export async function runTypingEffect() {
    const input = document.getElementById('prompt-input');
    const typingPrompts = [
        "Build a neon dashboard for a crypto app...",
        "Create a clean landing page for a SaaS product...",
        "Design a brutalist portfolio for a developer...",
        "Generate a mobile-first social media interface...",
        "Architect a glassmorphic glass weather app..."
    ];
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

// VOICE TO TEXT LOGIC
export function initVoiceRecognition(recognition, voiceBtn, promptInput) {
    if (voiceBtn && recognition) {
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
}

// PROJECT HISTORY SIDEBAR
export async function fetchProjectHistory(currentUser, loadExistingProject) {
    if (!currentUser) return;
    const historyList = document.getElementById('project-history-list');
    if (!historyList) return;

    try {
        const q = query(
            collection(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects"),
            orderBy("lastUpdated", "desc"),
            limit(10)
        );

        onSnapshot(q, (querySnapshot) => {
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
                item.onclick = () => { loadExistingProject(doc.id); };
                historyList.appendChild(item);
            });
            lucide.createIcons();
        });
    } catch (e) {
        console.error("Error loading history", e);
    }
}

// EXPLORER SCROLL
export function explorerScroll(direction) {
    const tabs = document.getElementById('file-tabs');
    if (tabs) {
        const offset = direction === 'left' ? -150 : 150;
        tabs.scrollBy({ left: offset, behavior: 'smooth' });
    }
}
