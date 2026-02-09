// ui_service.js
export function initUIService() {
    // Project Rename Logic
    const nameDisplay = document.getElementById('project-name-display');
    const renameModal = document.getElementById('rename-modal');
    nameDisplay?.addEventListener('click', () => renameModal.style.display = 'flex');

    // Publish Modal Logic
    const publishBtn = document.getElementById('publish-btn');
    const publishModal = document.getElementById('publish-modal');
    publishBtn?.addEventListener('click', () => publishModal.style.display = 'flex');

    // Countdown Hover Logic
    const counter = document.getElementById('reset-counter');
    counter?.addEventListener('mouseenter', () => counter.classList.add('expanded'));
    counter?.addEventListener('mouseleave', () => counter.classList.remove('expanded'));

    // Logs Toggle Logic
    const toggleLogsBtn = document.getElementById('toggle-logs');
    const frame = document.getElementById('preview-frame');
    const terminal = document.getElementById('logs-terminal');
    
    toggleLogsBtn?.addEventListener('click', () => {
        const isShowingLogs = terminal.style.display === 'flex';
        if (isShowingLogs) {
            terminal.style.display = 'none';
            frame.style.display = 'block';
            toggleLogsBtn.innerHTML = '<i data-lucide="terminal" class="w-3 h-3"></i> Logs';
        } else {
            terminal.style.display = 'flex';
            frame.style.display = 'none';
            toggleLogsBtn.innerHTML = '<i data-lucide="layout" class="w-3 h-3"></i> Preview';
        }
        lucide.createIcons();
    });
}

export function updateCountdown(secondsLeft) {
    const counter = document.getElementById('reset-counter');
    if (!counter) return;
    const h = Math.floor(secondsLeft / 3600);
    const m = Math.floor((secondsLeft % 3600) / 60);
    const s = secondsLeft % 60;
    
    counter.querySelector('.hours').innerText = `${h}h`;
    counter.querySelector('.full-time').innerText = `${m}m ${s}s`;
}

export function addLogEntry(type, message) {
    const terminal = document.getElementById('logs-terminal');
    if (!terminal) return;
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-msg log-type-${type}">${message}</span>
    `;
    
    terminal.appendChild(entry);
    terminal.scrollTop = terminal.scrollHeight;
}

export function clearLogs() {
    const terminal = document.getElementById('logs-terminal');
    if (terminal) terminal.innerHTML = '';
}
