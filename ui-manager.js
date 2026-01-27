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

export function initVoice(voiceBtn, promptInput, indicator) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    
    recognition.onstart = () => {
        voiceBtn.classList.add('text-emerald-500', 'animate-pulse');
    };

    recognition.onend = () => {
        voiceBtn.classList.remove('text-emerald-500', 'animate-pulse');
    };

    recognition.onresult = (e) => { 
        promptInput.value += (promptInput.value ? " " : "") + e.results[0][0].transcript; 
    };

    voiceBtn.onclick = () => recognition.start();
}

export function setupImageUpload(inputEl, trayEl, state, renderFn) {
    const handleRemove = (idx) => {
        state.attachedImages.splice(idx, 1);
        renderFn(trayEl, state.attachedImages, handleRemove);
    };

    inputEl.onchange = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                state.attachedImages.push(ev.target.result);
                renderFn(trayEl, state.attachedImages, handleRemove);
            };
            reader.readAsDataURL(file);
        });
    };
}

export function toggleView(view, frame, code, buttons, currentHtml = "") {
    if (view === 'code') {
        code.value = currentHtml; // Ensure the code view is updated with current content
        frame.classList.add('hidden');
        code.classList.remove('hidden');
        buttons.code.classList.add('bg-[#D4AF37]', 'text-black');
        buttons.preview.classList.remove('bg-[#D4AF37]', 'text-black');
    } else {
        frame.classList.remove('hidden');
        code.classList.add('hidden');
        buttons.preview.classList.add('bg-[#D4AF37]', 'text-black');
        buttons.code.classList.remove('bg-[#D4AF37]', 'text-black');
    }
}

export function toggleMobileView(frame) {
    return frame.classList.toggle('mobile-view');
}

export function exportProject(projectState) {
    const zip = new JSZip();
    const folderName = projectState.id || "ammoue-ai-project";
    const folder = zip.folder(folderName);

    Object.entries(projectState.pages).forEach(([name, html]) => {
        const fileName = name.endsWith('.html') ? name : `${name}.html`;
        folder.file(fileName, html);
    });

    zip.generateAsync({ type: "blob" }).then((content) => {
        const url = window.URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ammoue_export_${Date.now()}.zip`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        // Show Success notification
        showNotification("Project Exported Successfully");
    });
}

export function showNotification(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `fixed bottom-8 right-8 px-6 py-4 rounded-2xl border backdrop-blur-xl z-[200] transition-all duration-500 transform translate-y-20 opacity-0 flex items-center gap-3 shadow-2xl`;
    
    if (type === "success") {
        toast.classList.add("bg-emerald-500/10", "border-emerald-500/50", "text-emerald-400");
        toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span class="text-xs font-black uppercase tracking-widest">${message}</span>`;
    } else if (type === "error") {
        toast.classList.add("bg-red-500/10", "border-red-500/50", "text-red-400");
        toast.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span class="text-xs font-black uppercase tracking-widest">${message}</span>`;
    }

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove("translate-y-20", "opacity-0");
    }, 100);

    setTimeout(() => {
        toast.classList.add("translate-y-20", "opacity-0");
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

export function showExportModal(projectState, onConfirm) {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md";
    
    const folderName = projectState.id || "ammoue-ai-project";
    const filesHtml = Object.keys(projectState.pages).map(name => {
        const fileName = name.endsWith('.html') ? name : `${name}.html`;
        return `<div class="flex items-center gap-3 text-gray-400 text-xs py-1 border-b border-white/5">
                    <i class="fa-solid fa-file-code text-[#D4AF37]"></i> ${fileName}
                </div>`;
    }).join('');

    modal.innerHTML = `
        <div class="bg-[#111113] border border-white/10 rounded-3xl max-w-md w-full p-8 shadow-2xl scale-95 opacity-0 transition-all duration-300" id="export-inner">
            <h3 class="text-xl font-black text-white mb-2 tracking-tight">PREPARE ASSETS</h3>
            <p class="text-gray-500 text-[10px] uppercase tracking-widest mb-6">Bundling project into luxury archive</p>
            
            <div class="bg-black/40 rounded-2xl p-4 border border-white/5 mb-8">
                <div class="flex items-center gap-2 text-white text-xs font-bold mb-3">
                    <i class="fa-solid fa-folder-open text-[#D4AF37]"></i> ${folderName}/
                </div>
                <div class="pl-6 space-y-1">
                    ${filesHtml}
                    <div class="flex items-center gap-3 text-gray-400 text-xs py-1"><i class="fa-solid fa-file-lines text-blue-400"></i> ammoue-config.json</div>
                </div>
            </div>

            <div class="flex gap-4">
                <button id="close-export" class="flex-1 py-4 text-gray-500 hover:text-white text-[10px] font-black tracking-[0.2em] uppercase transition">Cancel</button>
                <button id="confirm-export" class="flex-1 btn-luxury py-4 rounded-2xl text-[10px]">DOWNLOAD ZIP</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    const inner = document.getElementById('export-inner');
    setTimeout(() => inner.classList.remove('scale-95', 'opacity-0'), 10);

    const close = () => {
        inner.classList.add('scale-95', 'opacity-0');
        setTimeout(() => modal.remove(), 300);
    };

    modal.querySelector('#close-export').onclick = close;
    modal.querySelector('#confirm-export').onclick = () => {
        onConfirm();
        close();
    };
}

export function confirmDelete(projectName, onDelete) {
    const confirmed = confirm(`Are you sure you want to permanently delete "${projectName}"? This action cannot be undone.`);
    if (confirmed) {
        onDelete();
        showNotification("Project Deleted", "error");
    }
}
