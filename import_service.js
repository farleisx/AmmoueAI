// import_service.js
export async function importFromGitHub(repoUrl) {
    try {
        const response = await fetch('/api/github-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoUrl })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || "Failed to import from GitHub");
        }
        
        return data;
    } catch (error) {
        console.error("Import Service Error:", error);
        throw error;
    }
}
