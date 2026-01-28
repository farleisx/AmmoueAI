// generation-engine.js
import { autoSaveProject } from "./fire_prompt.js";

export class GenerationEngine {
    constructor(config) {
        this.config = config; 
        this.abortCtrl = null;
        this.frameTimeout = null;
        this.streamingTarget = null; // Track which file is being written to
    }

    // Helper to extract specific [TAG: content] from the AI stream
    parseTags(text, tag, callback) {
        const regex = new RegExp(`\\[${tag}:\\s*(.*?)\\]`, 'g');
        let match;
        while ((match = regex.exec(text)) !== null) {
            callback(match[1].trim());
        }
        return text.replace(regex, "");
    }

    // NEW: Moved from main file to handle UI updates for tabs
    renderTabs(projectState, container) {
        container.innerHTML = Object.keys(projectState.pages).map(name => `
            <button onclick="window.switchPage('${name}')" class="px-3 py-1 text-[9px] font-bold rounded-md uppercase transition-all duration-200 ${projectState.currentPage === name ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500 hover:text-slate-200'}">
                ${name}
            </button>
        `).join('');
    }

    async start({ prompt, style, auth, projectState, attachedImages, isResume }) {
        this.abortCtrl = new AbortController();
        const { ui, callbacks } = this.config;

        ui.thinkingBox.classList.remove('hidden');
        ui.genBtn.disabled = true;
        this.streamingTarget = projectState.currentPage; // Default to current

        try {
            const token = await auth.currentUser.getIdToken();
            const finalPrompt = style ? `Style: ${style}. ${prompt}` : prompt;

            const res = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    prompt: finalPrompt,
                    images: attachedImages,
                    partialCode: isResume ? projectState.currentHtml : null,
                    pageName: projectState.currentPage
                }),
                signal: this.abortCtrl.signal
            });

            if (!res.ok) throw new Error("Connection failed");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let progress = 0;

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                progress += 1.5;
                ui.progressFill.style.width = `${Math.min(progress, 95)}%`;

                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const dataStr = line.slice(6).trim();
                    if (dataStr === '[DONE]') break;

                    try {
                        const json = JSON.parse(dataStr);
                        if (json.text) {
                            let text = json.text;

                            // Handle New Page Signal - Updates target for subsequent text chunks
                            text = this.parseTags(text, 'NEW_PAGE', (pageName) => {
                                const cleanName = pageName.toLowerCase();
                                this.streamingTarget = cleanName;
                                callbacks.onNewPage(cleanName);
                            });

                            // Handle Action Logs
                            text = this.parseTags(text, 'ACTION', (actionText) => {
                                callbacks.onAction(actionText);
                            });

                            // Remove [END_PAGE] markers if present in stream
                            text = text.replace(/\[END_PAGE\]/g, "");

                            // Update the correct file in the pages object
                            if (!projectState.pages[this.streamingTarget]) {
                                projectState.pages[this.streamingTarget] = "";
                            }
                            
                            projectState.pages[this.streamingTarget] += text;
                            
                            // Relay update to the UI/Bridge
                            callbacks.onCodeUpdate(projectState.pages[this.streamingTarget], this.streamingTarget);
                        }
                    } catch (e) { /* Ignore partial JSON chunks */ }
                }
            }

            // Auto-save after completion
            await autoSaveProject(
                projectState.pages, 
                prompt, 
                projectState.id, 
                auth.currentUser.uid, 
                ui.logs.innerHTML, 
                projectState.currentPage
            );

        } catch (err) {
            if (err.name !== 'AbortError') callbacks.onError(err.message);
        } finally {
            ui.genBtn.disabled = false;
            ui.progressFill.style.width = "100%";
            setTimeout(() => ui.progressBar.classList.add('hidden'), 600);
        }
    }

    stop() {
        if (this.abortCtrl) this.abortCtrl.abort();
    }
}
