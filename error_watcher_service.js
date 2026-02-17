// error_watcher_service.js
export function initErrorWatcher(context) {
    const { frame, onIframeError } = context;

    const injectWatcher = () => {
        try {
            const frameDoc = frame.contentWindow.document;
            if (!frameDoc) return;

            const script = frameDoc.createElement('script');
            script.textContent = `
                window.onerror = function(msg, url, line, col, error) {
                    window.parent.postMessage({
                        type: 'IFRAME_ERROR',
                        error: { msg, line, col, stack: error?.stack }
                    }, '*');
                };
                console.error = (function(orig) {
                    return function(...args) {
                        window.parent.postMessage({
                            type: 'IFRAME_CONSOLE_ERROR',
                            msg: args.join(' ')
                        }, '*');
                        orig.apply(console, args);
                    };
                })(console.error);
            `;
            frameDoc.head.appendChild(script);
        } catch (e) {
            // Cross-origin safety
        }
    };

    frame.onload = injectWatcher;

    window.addEventListener('message', (event) => {
        if (event.data.type === 'IFRAME_ERROR' || event.data.type === 'IFRAME_CONSOLE_ERROR') {
            onIframeError(event.data);
        }
    });
}
