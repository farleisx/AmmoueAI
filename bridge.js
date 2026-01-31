import { auth, getUsage, autoSaveProject } from "./fire_prompt.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { generateProjectStream } from "./generator_service.js";
import { deployProject } from "./deployment_service.js";
import { initAttachmentService, getAttachedImages, clearAttachments } from "./attachment_service.js";

let currentUser = null;
let currentProjectId = null;
let projectPages = { landing: "" };

onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "/login";
    else { currentUser = user; syncUsage(); }
});

initAttachmentService('image-upload', 'attach-btn', 'attachment-rack', 'image-preview-modal', 'modal-img');

const sidebar = document.getElementById('code-sidebar');
const codeOutput = document.getElementById('code-output');
const thinkingStatus = document.getElementById('thinking-status');

async function syncUsage() {
    if (!currentUser) return;
    const usage = await getUsage(currentUser.uid);
    document.getElementById('credit-display').innerText = `Daily: ${usage.dailyCount || 0}`;
}

document.getElementById('generate-btn')?.addEventListener('click', async () => {
    const prompt = document.getElementById('prompt-input').value.trim();
    if (!prompt || !currentUser) return;

    try {
        document.getElementById('generate-btn').disabled = true;
        codeOutput.innerText = "";
        sidebar.classList.add('open');
        
        const idToken = await currentUser.getIdToken();
        if (!currentProjectId) {
            currentProjectId = await autoSaveProject(projectPages, prompt, null, currentUser.uid, "Start", "landing", "Project");
        }

        await generateProjectStream(
            prompt, "vanilla", currentProjectId, idToken, 
            (chunk) => {
                codeOutput.innerText += chunk;
                codeOutput.parentElement.scrollTop = codeOutput.parentElement.scrollHeight;
            },
            (status) => {
                if (status.status === 'completed') {
                    document.getElementById('generate-btn').disabled = false;
                    thinkingStatus.innerText = "Build Finished";
                    syncUsage();
                }
            },
            (fileName) => {
                thinkingStatus.innerHTML = `<span class="flex items-center gap-2"><span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> Generating: ${fileName}</span>`;
            }
        );
    } catch (err) { alert(err.message); document.getElementById('generate-btn').disabled = false; }
});

document.getElementById('publish-btn')?.addEventListener('click', async () => {
    if (!currentProjectId || !currentUser) return alert("Build a project first.");
    const slug = prompt("Enter a site name (slug):");
    if (!slug) return;

    try {
        const idToken = await currentUser.getIdToken();
        const result = await deployProject(currentProjectId, idToken, { slug, framework: "vanilla" });
        window.open(result.deploymentUrl, '_blank');
    } catch (err) { alert(err.message); }
});

document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));
