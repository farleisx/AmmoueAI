// self_healing_service.js
export function initSelfHealing(context) {
    const { 
        getProjectId, 
        db, 
        collection, 
        query, 
        orderBy, 
        limit, 
        onSnapshot 
    } = context;

    let logsUnsubscribe = null;

    if (document.getElementById('toggle-logs')) {
        document.getElementById('toggle-logs').onclick = () => {
            const currentProjectId = getProjectId();
            const terminal = document.getElementById('logs-terminal');
            const frame = document.getElementById('preview-frame');
            const isHidden = terminal.style.display === 'none' || !terminal.style.display;
            terminal.style.display = isHidden ? 'flex' : 'none';
            frame.style.display = isHidden ? 'none' : 'block';
            if (isHidden && currentProjectId) {
                if (logsUnsubscribe) logsUnsubscribe();
                const logsRef = collection(db, "artifacts", "ammoueai", "projects", currentProjectId, "live_logs");
                const q = query(logsRef, orderBy("timestamp", "desc"), limit(50));
                logsUnsubscribe = onSnapshot(q, (snap) => {
                    terminal.innerHTML = '';
                    snap.docs.forEach(d => {
                        const l = d.data();
                        const entry = document.createElement('div');
                        entry.className = 'log-entry log-type-error';
                        const time = l.timestamp?.toDate().toLocaleTimeString() || '...';
                        entry.innerHTML = `
                            <span class="log-time">[${time}]</span>
                            <span class="log-msg">${l.message}</span>
                            <button class="ml-auto bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] hover:bg-emerald-500 hover:text-white transition flex items-center gap-1" onclick="window.selfHeal('${btoa(l.message)}')">
                                <i data-lucide="wand-2" class="w-2.5 h-2.5"></i> Fix
                            </button>`;
                        terminal.appendChild(entry);
                    });
                    lucide.createIcons();
                });
            }
        };
    }
}
