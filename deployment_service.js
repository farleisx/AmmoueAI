export async function deployProject(projectId, idToken, options = {}) {
    const { slug, customDomain, framework = "vanilla" } = options;

    const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
            projectId,
            slug,
            customDomain,
            framework
        })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Deployment failed');
    
    return data;
}
