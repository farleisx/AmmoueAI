// deployment_logic_service.js
export function initDeploymentLogic(context) {
    const { 
        getProjectId, 
        getUser, 
        getProjectFiles, 
        db, 
        doc, 
        updateDoc, 
        showCustomAlert, 
        executeDeploymentFlow 
    } = context;

    if (document.getElementById('publish-btn')) {
        document.getElementById('publish-btn').onclick = () => {
            const currentName = document.getElementById('project-name-display').innerText;
            const slugInput = document.getElementById('publish-slug');
            if (slugInput && currentName) {
                slugInput.value = currentName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            }
            document.getElementById('publish-modal').style.display = 'flex';
        };
    }

    if (document.getElementById('confirm-publish')) {
        document.getElementById('confirm-publish').onclick = executeDeploymentFlow;
    }

    if (document.getElementById('redeploy-btn')) {
        document.getElementById('redeploy-btn').onclick = () => {
            const confirmBtn = document.getElementById('confirm-publish');
            if (confirmBtn) {
                confirmBtn.innerHTML = `<i data-lucide="rocket" class="w-4 h-4"></i> Deploy Now`;
                confirmBtn.onclick = executeDeploymentFlow;
                confirmBtn.click();
            }
        };
    }
}
