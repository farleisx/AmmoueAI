// generation_ui_service.js
export function updateGenerateButtonToStop() {
    const btn = document.getElementById('generate-btn');
    if (btn) {
        btn.innerHTML = `<i data-lucide="square" class="w-4 h-4 mr-2 fill-current"></i> Stop`;
        btn.classList.add('bg-red-500/10', 'text-red-500', 'border', 'border-red-500/20');
        btn.classList.remove('bg-[#ededed]', 'text-black');
        if (window.lucide) lucide.createIcons();
    }
}

export function resetGenerateButton() {
    const btn = document.getElementById('generate-btn');
    if (btn) {
        btn.innerHTML = `<i data-lucide="rocket" class="rocket-icon w-4 h-4"></i> Generate`;
        btn.classList.remove('bg-red-500/10', 'text-red-500', 'border', 'border-red-500/20');
        btn.classList.add('bg-[#ededed]', 'text-black');
        if (window.lucide) lucide.createIcons();
    }
}

export function renderFileTabsFromRaw(rawText, activeFile) {
    const fileMap = {};
    const regex = /\/\*\s*\[NEW_PAGE:\s*(.*?)\s*\]\s*\*\/([\s\S]*?)(?=\/\*\s*\[NEW_PAGE:|$)/g;
    let match;
    while ((match = regex.exec(rawText)) !== null) {
        const fileName = match[1].trim();
        const content = match[2].split(/\/\*\s*\[END_PAGE\]/)[0].trim();
        fileMap[fileName] = content;
    }
    return fileMap;
}

// --- AI PROTOCOL UI LOGIC ---

let unreadActionCount = 0;

export function addAiActionLine(actionText) {
    const container = document.getElementById('ai-actions-list');
    const badge = document.getElementById('ai-action-badge');
    const protocolBtn = document.getElementById('ai-protocol-btn');
    const feedVisible = document.getElementById('ai-actions-feed') && !document.getElementById('ai-actions-feed').classList.contains('hidden');

    if (!container) return;

    const entry = document.createElement('div');
    entry.className = 'action-line flex gap-3 group animate-in slide-in-from-bottom-2 duration-300 mb-3';
    entry.innerHTML = `
        <div class="flex-shrink-0 mt-1">
            <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
        </div>
        <div class="flex flex-col gap-1">
            <span class="text-[11px] text-gray-300 leading-relaxed font-medium">${actionText}</span>
            <span class="text-[8px] text-gray-600 font-mono">${new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
    `;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;

    if (!feedVisible) {
        unreadActionCount++;
        if (badge) {
            badge.innerText = unreadActionCount;
            badge.classList.remove('hidden');
        }
        if (protocolBtn) {
            protocolBtn.classList.add('pulse-active', 'border-red-500/30');
        }
    }
}

export function clearAiActions() {
    const container = document.getElementById('ai-actions-list');
    const badge = document.getElementById('ai-action-badge');
    const protocolBtn = document.getElementById('ai-protocol-btn');
    
    // UI ONLY CLEAR: This does not affect the Firestore logsContent field
    if (container) container.innerHTML = '';
    unreadActionCount = 0;
    if (badge) badge.classList.add('hidden');
    if (protocolBtn) protocolBtn.classList.remove('pulse-active', 'border-red-500/30');
}

export function toggleAiActionsFeed() {
    const feed = document.getElementById('ai-actions-feed');
    const badge = document.getElementById('ai-action-badge');
    const protocolBtn = document.getElementById('ai-protocol-btn');
    
    if (!feed) return;
    const isVisible = !feed.classList.contains('hidden');

    if (isVisible) {
        feed.classList.add('hidden');
    } else {
        feed.classList.remove('hidden');
        unreadActionCount = 0;
        if (badge) badge.classList.add('hidden');
        if (protocolBtn) protocolBtn.classList.remove('pulse-active', 'border-red-500/30');
    }
}
