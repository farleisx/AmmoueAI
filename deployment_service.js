// deployment_service.js
export async function deployProject(projectId, idToken, options = {}) {
    const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ projectId, ...options })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Deployment failed');
    return data;
}

export async function renameRemoteProject(projectId, idToken, newName) {
    const response = await fetch('/api/rename-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ projectId, newName })
    });
    return response.ok;
}
