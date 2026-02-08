// command_palette_service.js
export function initCommandPaletteLogic(setPreviewSize) {
    const cmds = [
        { label: 'Publish to Web', action: () => document.getElementById('publish-btn').click() },
        { label: 'Export ZIP', action: () => document.getElementById('download-btn').click() },
        { label: 'Rename Project', action: () => document.getElementById('project-name-display').click() },
        { label: 'Switch to Mobile View', action: () => setPreviewSize('mobile') },
        { label: 'Switch to Desktop View', action: () => setPreviewSize('desktop') },
        { label: 'Toggle Code', action: () => document.getElementById('toggle-code').click() },
        { label: 'Toggle Theme', action: () => document.getElementById('theme-toggle').click() }
    ];

    const input = document.getElementById('command-input');
    if (input) {
        input.oninput = (e) => {
            const val = e.target.value.toLowerCase();
            const results = cmds.filter(c => c.label.toLowerCase().includes(val));
            const resCont = document.getElementById('command-results');
            resCont.innerHTML = results.map((r, i) => `<div class="p-3 hover:bg-white/5 rounded-lg cursor-pointer transition cmd-item" data-idx="${i}">${r.label}</div>`).join('');
            document.querySelectorAll('.cmd-item').forEach(el => {
                el.onclick = () => {
                    const idx = el.getAttribute('data-idx');
                    results[idx].action();
                    document.getElementById('command-palette').classList.add('hidden');
                };
            });
        };
    }
}

export function handleGlobalKeyDown(e, generateBtnId) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const palette = document.getElementById('command-palette');
        palette.classList.toggle('hidden');
        if (!palette.classList.contains('hidden')) document.getElementById('command-input').focus();
    }
    if (e.key === 'Enter' && document.activeElement.id === 'prompt-input' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById(generateBtnId).click();
    }
}
