// deployment-manager.js
import { updateProjectDeploymentUrl } from "./fire_prompt.js";

export class DeploymentManager {
    constructor(config) {
        this.config = config; // UI: publishBtn, logs, etc.
    }

    async deploy({ html, projectId, slug, auth, customDomain, engine, promptRef }) {
        const { ui, callbacks } = this.config;
        
        const performAttempt = async (attempt = 1) => {
            ui.publishBtn.innerText = attempt > 1 ? `HEALING (ATTEMPT ${attempt})...` : "BROADCASTING...";
            ui.publishBtn.disabled = true;

            try {
                const token = await auth.currentUser.getIdToken();
                const faviconHtml = `<link rel="icon" type="image/png" href="Gemini_Generated_Image_qry9pfqry9pfqry9.png">`;
                const finalContent = html.includes('<head>') ? html.replace('<head>', `<head>${faviconHtml}`) : faviconHtml + html;

                const res = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ 
                        htmlContent: finalContent, 
                        projectId, 
                        slug, 
                        customDomain, 
                        attempt 
                    })
                });

                const data = await res.json();

                // --- TRIGGER RECURSIVE HEALING ---
                if (res.status === 422 && data.error === "CORRUPT_FILES_DETECTED" && attempt <= 3) {
                    ui.logs.innerHTML += `<div class="log-entry text-amber-400 font-bold">> 🛠️ AUDIT FAILED: ${data.details}</div>`;
                    ui.logs.innerHTML += `<div class="log-entry text-amber-500">> Initiating automated repair sequence...</div>`;

                    // We use the Generation Engine to fix the code based on the error details
                    const fixPrompt = `FIX ERROR: ${data.details}. Ensure all tags are closed and the framework structure is valid.`;
                    
                    // We call back to the engine to run a "Resume" generation
                    await engine.start({
                        prompt: fixPrompt,
                        auth,
                        projectState: callbacks.getProjectState(),
                        isResume: true 
                    });

                    // Recursive call: try deploying the newly fixed code
                    return performAttempt(attempt + 1);
                }

                if (res.status === 403) {
                    callbacks.onLimitReached(data.error);
                    return;
                }

                if (data.deploymentUrl) {
                    await updateProjectDeploymentUrl(projectId, data.deploymentUrl, auth.currentUser.uid);
                    ui.logs.innerHTML += `<div class="log-entry text-emerald-400">> 🚀 BROADCAST SUCCESSFUL: ${data.deploymentUrl}</div>`;
                    callbacks.onSuccess(data.deploymentUrl);
                } else {
                    throw new Error(data.error || "Unknown deployment error");
                }

            } catch (e) {
                ui.logs.innerHTML += `<div class="log-entry text-red-500">> DEPLOYMENT CRITICAL ERROR: ${e.message}</div>`;
                callbacks.onFailure();
            } finally {
                ui.publishBtn.disabled = false;
            }
        };

        await performAttempt(1);
    }
}
