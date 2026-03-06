// project_actions_service.js
export function initProjectActions(context) {
    const { 
        getProjectId, 
        getUser, 
        db, 
        doc, 
        getDoc, 
        updateDoc, 
        showCustomAlert, 
        downloadProjectFiles, 
        renameRemoteProject, 
        handleRenameLogic, 
        generateCoolName 
    } = context;

    if (document.getElementById('project-name-display')) {
        document.getElementById('project-name-display').onclick = () => {
            document.getElementById('rename-modal').style.display = 'flex';
        };
    }

    if (document.getElementById('download-btn')) {
        document.getElementById('download-btn').onclick = async () => {
            const currentProjectId = getProjectId();
            const currentUser = getUser();
            
            const exportBtn = document.getElementById('export-github-btn');
            const downloadBtn = document.getElementById('confirm-download');
            const importBtn = document.getElementById('import-github-btn');
            const listContainer = document.getElementById('file-list-display');

            if (!currentProjectId) {
                // BYPASS ALERT: Allow modal to open but hide export options
                if (exportBtn) exportBtn.style.display = 'none';
                if (downloadBtn) downloadBtn.style.display = 'none';
                if (importBtn) {
                    importBtn.classList.add('premium-highlight');
                }
                if (listContainer) listContainer.innerHTML = '<div class="text-gray-500 text-xs italic">No files to export yet. Import a project to begin.</div>';
            } else {
                // RESET UI: Show all options if project exists
                if (exportBtn) exportBtn.style.display = 'flex';
                if (downloadBtn) downloadBtn.style.display = 'flex';
                if (importBtn) importBtn.classList.remove('premium-highlight');
                
                const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
                const snap = await getDoc(projectRef);
                if (snap.exists()) {
                    const filesData = snap.data().pages || {};
                    const files = Object.keys(filesData);
                    if (listContainer) {
                        listContainer.innerHTML = files.map(f => `<div class="flex items-center gap-2 text-gray-400 text-sm py-1"><i data-lucide="file-code" class="w-4 h-4 text-emerald-500"></i> ${f}</div>`).join('');
                        lucide.createIcons();
                    }
                }
            }
            document.getElementById('download-modal').style.display = 'flex';
        };
    }

    if (document.getElementById('confirm-download')) {
        document.getElementById('confirm-download').onclick = async () => {
            const currentProjectId = getProjectId();
            const currentUser = getUser();
            const btn = document.getElementById('confirm-download');
            btn.innerText = "Zipping...";
            await downloadProjectFiles(currentProjectId, currentUser.uid);
            btn.innerText = "Download ZIP";
            document.getElementById('download-modal').style.display = 'none';
        };
    }

    if (document.getElementById('confirm-rename')) {
        document.getElementById('confirm-rename').onclick = async () => {
            const currentProjectId = getProjectId();
            const currentUser = getUser();
            await handleRenameLogic(currentProjectId, currentUser, db, updateDoc, doc, renameRemoteProject, showCustomAlert);
        };
    }
}
