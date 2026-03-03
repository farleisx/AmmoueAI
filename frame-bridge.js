// frame-bridge.js
import { addLogEntry } from "./ui_service.js";

export class FrameBridge {
    constructor(config) {
        this.frame = config.frame;
        this.codeView = config.codeView;
        this.callbacks = config.callbacks;
        this.blobUrl = null;
        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener('message', (event) => {
            // SECURITY: Origin validation (Replace with your actual domain in production)
            const isLocal = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1');
            const isSelf = event.origin === window.location.origin || event.origin === 'null'; // 'null' is often the origin for sandboxed blobs
            
            if (!isSelf && !isLocal) return;

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
            
            // SECURITY: Apply stricter Sandbox (Allow scripts but isolate origin)
            this.frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // SECURITY: Remove any manual top-level window access attempts in generated code
        doc.querySelectorAll('*').forEach(el => {
            [...el.attributes].forEach(attr => {
                if (attr.value.includes('window.parent') || attr.value.includes('window.top')) {
                    el.removeAttribute(attr.name);
                }
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

            // Console Proxy for UI Log service
            const originalLog = console.log;
            console.log = (...args) => {
                window.parent.postMessage({ type: 'CONSOLE_LOG', logType: 'log', message: args.join(' ') }, '*');
                originalLog.apply(console, args);
            };
        `;
        doc.body.appendChild(s);

        // SECURITY: ISOLATED MODE - Use Blob URL to create a unique origin jail
        if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
        const blob = new Blob([doc.documentElement.outerHTML], { type: 'text/html' });
        this.blobUrl = URL.createObjectURL(blob);
        
        this.frame.src = this.blobUrl;

        if (this.codeView) this.codeView.value = html;
    }
}
