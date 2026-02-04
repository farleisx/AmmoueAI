// project_ui_service.js
export function updateFileTabsUI(projectFiles, activeFile) {
    const tabContainer = document.getElementById('file-tabs');
    if (!tabContainer) return;
    const files = Object.keys(projectFiles);
    tabContainer.innerHTML = files.map(f => `
        <button onclick="window.switchFile('${f}')" class="px-3 py-2 text-[11px] border-r border-white/5 whitespace-nowrap ${activeFile === f ? 'bg-white/5 text-white' : 'text-gray-500'} hover:text-white transition">
            ${f}
        </button>
    `).join('');
}

export function displayActiveFile(projectFiles, activeFile) {
    const output = document.getElementById('code-output');
    if (output) output.innerText = projectFiles[activeFile] || "";
    updatePreview(projectFiles, activeFile);
}

export function updatePreview(projectFiles, activeFile) {
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

export function updateSaveIndicator(text) {
    const el = document.getElementById('save-status');
    if (el) el.innerText = text;
}

export function showLoadingSkeleton(show) {
    const skeleton = document.getElementById('preview-skeleton');
    if (skeleton) skeleton.classList.toggle('hidden', !show);
}

export function showActionLine(text) {
    const container = document.getElementById('action-lines-container');
    if (!container) return;
    const line = document.createElement('div');
    line.className = "action-line bg-white/5 border border-white/5 text-[10px] text-gray-400 px-3 py-1 rounded-full whitespace-nowrap";
    line.innerText = text;
    container.appendChild(line);
    setTimeout(() => line.remove(), 5000);
}
