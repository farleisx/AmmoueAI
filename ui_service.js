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
