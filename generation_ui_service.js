// generation_ui_service.js
export function updateGenerateButtonToStop() {
    const btn = document.getElementById('generate-btn');
    if (btn) {
        btn.innerHTML = `<i data-lucide="square" class="w-4 h-4 mr-2 fill-current"></i> Stop`;
        btn.classList.add('bg-red-500/10', 'text-red-500', 'border', 'border-red-500/20');
        btn.classList.remove('bg-[#ededed]', 'text-black');
        lucide.createIcons();
    }
}

export function resetGenerateButton() {
    const btn = document.getElementById('generate-btn');
    if (btn) {
        btn.innerHTML = `<i data-lucide="rocket" class="rocket-icon w-4 h-4"></i> Generate`;
        btn.classList.remove('bg-red-500/10', 'text-red-500', 'border', 'border-red-500/20');
        btn.classList.add('bg-[#ededed]', 'text-black');
        lucide.createIcons();
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
    
    // ADDITIVE: Action Line Extraction
    let lastAction = null;
    const actionRegex = /\[ACTION:\s*(.*?)\s*\]/g;
    let actionMatch;
    while ((actionMatch = actionRegex.exec(rawText)) !== null) {
        lastAction = actionMatch[1].trim();
    }

    return { fileMap, lastAction };
}

// ADDITIVE: Action Line UI Component
export function showActionLine(text) {
    const container = document.getElementById('action-lines-container');
    if (!container) return;

    const existing = Array.from(container.querySelectorAll('.action-line-text'))
                          .find(el => el.innerText === text);
    if (existing) return;

    const line = document.createElement('div');
    line.className = "action-line flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap shadow-sm mb-2";
    line.innerHTML = `
        <i data-lucide="sparkles" class="w-3 h-3 animate-pulse"></i>
        <span class="action-line-text">${text}</span>
    `;
    
    container.prepend(line);
    lucide.createIcons();

    setTimeout(() => {
        line.classList.add('opacity-0', 'translate-y-[-10px]', 'transition-all', 'duration-500');
        setTimeout(() => line.remove(), 500);
    }, 6000);
}
