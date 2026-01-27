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
