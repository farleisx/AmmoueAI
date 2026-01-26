// ui-manager.js
export function generateCoolName(inputEl) {
    const adjs = ["prestige", "elara", "vanta", "aurum", "velvet", "onyx", "luxe", "monarch", "ethereal", "ivory"];
    const nouns = ["studio", "folio", "estate", "manor", "vault", "atlas", "domain", "crest", "sphere", "pillar"];
    const adj = adjs[Math.floor(Math.random() * adjs.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 99);
    inputEl.value = `${adj}-${noun}-${num}`;
}

export function renderImages(trayEl, attachedImages, removeCallback) {
    trayEl.innerHTML = attachedImages.map((src, i) => `
        <div class="img-bubble">
            <img src="${src}">
            <div class="remove-img" data-index="${i}"><i class="fa-solid fa-xmark"></i></div>
        </div>
    `).join('');
    
    // Add event listeners to the newly created remove buttons
    trayEl.querySelectorAll('.remove-img').forEach(btn => {
        btn.onclick = () => removeCallback(parseInt(btn.dataset.index));
    });
}

export function renderProjectHistory(listEl, projects, loadCallback) {
    listEl.innerHTML = "";
    projects.forEach(p => {
        const item = document.createElement("div");
        item.className = "history-item p-4 rounded-2xl bg-white/5 hover:bg-[#D4AF37]/10 transition cursor-pointer";
        item.innerHTML = `
            <div class="text-xs font-semibold text-white truncate">${p.title || p.prompt || "Untitled Project"}</div>
            <div class="text-[9px] uppercase tracking-widest mt-1 ${p.deploymentUrl ? "text-emerald-400" : "text-gray-500"}">${p.deploymentUrl ? "LIVE" : "DRAFT"}</div>
        `;
        item.onclick = () => loadCallback(p);
        listEl.appendChild(item);
    });
}
