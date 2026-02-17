// session_service.js
export function saveSessionState(state) {
    const data = {
        activeFile: state.activeFile,
        currentProjectId: state.currentProjectId,
        timestamp: Date.now()
    };
    localStorage.setItem('ammoue_session', JSON.stringify(data));
}

export function loadSessionState() {
    const saved = localStorage.getItem('ammoue_session');
    if (!saved) return null;
    
    const data = JSON.parse(saved);
    // Expire session after 24 hours
    if (Date.now() - data.timestamp > 86400000) {
        localStorage.removeItem('ammoue_session');
        return null;
    }
    return data;
}

export function clearSession() {
    localStorage.removeItem('ammoue_session');
}
