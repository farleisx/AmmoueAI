// export_service.js
export async function handleGitHubExport(currentProjectId, currentUser, projectFiles, showCustomAlert) {
    if (!currentProjectId) return;
    const btn = document.getElementById('export-github-btn');
    const idToken = await currentUser.getIdToken();
    const userGitHubToken = localStorage.getItem('gh_access_token');
    const projectName = document.getElementById('project-name-display').innerText;

    if (!userGitHubToken) {
        showCustomAlert("GitHub Auth Error", "You must be logged in through GitHub to export. Please re-login with GitHub.");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Pushing...";

    try {
        const res = await fetch('/api/github/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ projectId: currentProjectId, projectName, files: projectFiles, userGitHubToken })
        });
        const data = await res.json();
        if (data.repoUrl) {
            window.open(data.repoUrl, '_blank');
        } else {
            throw new Error(data.message || "Unknown error during export.");
        }
    } catch (e) { 
        showCustomAlert("GitHub Export Error", e.message); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = `<i data-lucide="github" class="w-4 h-4"></i> Push to GitHub`; 
        lucide.createIcons(); 
    }
}

export function handleOpenInTab(activeFile, projectFiles) {
    const content = projectFiles[activeFile] || "";
    const win = window.open('about:blank', '_blank');
    if (win) {
        win.document.write(activeFile.endsWith('.html') ? content : `<pre>${content}</pre>`);
        win.document.close();
    }
}
