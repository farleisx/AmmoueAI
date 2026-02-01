export function initLiveEditor(iframe) {
    iframe.addEventListener('load', () => {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.addEventListener('click', (e) => {
            const target = e.target;
            const validTags = ['H1', 'H2', 'H3', 'P', 'SPAN', 'BUTTON'];
            
            if (validTags.includes(target.tagName)) {
                e.preventDefault();
                const newText = prompt(`Edit ${target.tagName}:`, target.innerText);
                if (newText !== null) {
                    target.innerText = newText;
                    // Trigger a save event if needed
                    window.dispatchEvent(new CustomEvent('preview-updated'));
                }
            }
        });
        
        // Add visual indicator style to iframe
        const style = doc.createElement('style');
        style.innerHTML = `
            h1:hover, h2:hover, h3:hover, p:hover, span:hover, button:hover { 
                outline: 2px dashed #3b82f6; cursor: pointer; 
            }
        `;
        doc.head.appendChild(style);
    });
}
