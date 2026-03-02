// export_service.js
import { GithubAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from "./fire_prompt.js";

export async function handleGitHubExport(currentProjectId, currentUser, projectFiles, showCustomAlert) {
    if (!currentProjectId) return;
    const btn = document.getElementById('export-github-btn');
    const idToken = await currentUser.getIdToken();
    let userGitHubToken = localStorage.getItem('gh_access_token');
    const projectName = document.getElementById('project-name-display').innerText;

    if (!userGitHubToken) {
        try {
            const provider = new GithubAuthProvider();
            provider.addScope('repo');
            provider.addScope('admin:repo_hook');
            
            const result = await signInWithPopup(auth, provider);
            const credential = GithubAuthProvider.credentialFromResult(result);
            userGitHubToken = credential.accessToken;
            
            if (userGitHubToken) {
                localStorage.setItem('gh_access_token', userGitHubToken);
            } else {
                throw new Error("Failed to retrieve GitHub access token.");
            }
        } catch (authError) {
            console.error("GitHub Popup Auth Error:", authError);
            showCustomAlert("GitHub Auth Error", "Failed to connect to GitHub. Please ensure popups are enabled.");
            return;
        }
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
