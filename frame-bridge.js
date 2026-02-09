// frame-bridge.js
import { addLogEntry } from "./ui_service.js";

export class FrameBridge {
    constructor(config) {
        this.frame = config.frame;
        this.codeView = config.codeView;
        this.callbacks = config.callbacks;
        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener('message', (event) => {
            if (event.data.type === 'SYNC_TEXT') {
                this.callbacks.onSyncText(event.data.syncId, event.data.newContent);
            }
            if (event.data.type === 'SWITCH_PAGE_INTERNAL') {
                this.callbacks.onSwitchPage(event.data.pageName);
            }
            if (event.data.type === 'CONSOLE_LOG') {
                addLogEntry(event.data.logType, event.data.message);
            }
        });
    }

    update(html) {
        // Ensure preview frame is visible and placeholder is hidden
        if (this.frame) {
            this.frame.classList.remove('hidden');
            const placeholder = document.getElementById('preview-placeholder');
            if (placeholder) placeholder.classList.add('hidden');
        }

        const parser = new DOMParser();
        // Security: Remove script tags and inline handlers
        const sanitizedHtml = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
        const doc = parser.parseFromString(sanitizedHtml, 'text/html');

        doc.querySelectorAll('*').forEach(el => {
            [...el.attributes].forEach(attr => {
                if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
            });
        });

        // Inject contentEditable and Sync IDs
        const textTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'li', 'button'];
        doc.querySelectorAll(textTags.join(',')).forEach((el, index) => {
            el.setAttribute('contenteditable', 'true');
            el.setAttribute('data-sync-id', index);
            el.style.outline = 'none';
        });

        // Inject the Bridge Script into the Iframe
        const s = doc.createElement('script');
        s.textContent = `
            document.querySelectorAll('[contenteditable]').forEach(el => {
                el.addEventListener('blur', () => {
                    window.parent.postMessage({
                        type: 'SYNC_TEXT',
                        syncId: el.getAttribute('data-sync-id'),
                        newContent: el.innerHTML
                    }, '*');
                });
            });

            document.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', (e) => {
                    const href = link.getAttribute('href');
                    if (href && href.endsWith('.html')) {
                        e.preventDefault();
                        window.parent.postMessage({
                            type: 'SWITCH_PAGE_INTERNAL',
                            pageName: href.replace('.html', '')
                        }, '*');
                    }
                });
            });
        `;
        doc.body.appendChild(s);

        this.frame.srcdoc = doc.documentElement.outerHTML;
        if (this.codeView) this.codeView.value = html;
    }
}
