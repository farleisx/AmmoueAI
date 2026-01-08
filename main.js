import { auth, db, getUserPlan, autoSaveProject, updateProjectDeploymentUrl } from "./fire_prompt.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

let currentProjectId = null;
let currentHtml = "";
let userPlan = "free";

// UI Elements
const promptInput = document.getElementById('user-prompt');
const generateBtn = document.getElementById('generate-btn');
const refineBtn = document.getElementById('refine-btn');
const deployBtn = document.getElementById('deploy-btn');
const previewFrame = document.getElementById('preview-frame');
const previewStatus = document.getElementById('preview-status');

/* ---------------- AUTH LOGIC ---------------- */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('login-btn').classList.add('hidden');
        document.getElementById('user-info').classList.remove('hidden');
        document.getElementById('user-avatar').src = user.photoURL;
        userPlan = await getUserPlan(user.uid);
        document.getElementById('user-plan').innerText = `Plan: ${userPlan}`;
    } else {
        document.getElementById('login-btn').classList.remove('hidden');
        document.getElementById('user-info').classList.add('hidden');
    }
});

document.getElementById('login-btn').onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
document.getElementById('logout-btn').onclick = () => signOut(auth);

/* ---------------- GENERATION LOGIC ---------------- */
generateBtn.onclick = async () => {
    if (!auth.currentUser) return alert("Please login first!");
    
    const prompt = promptInput.value;
    if (!prompt) return;

    generateBtn.disabled = true;
    previewStatus.innerText = "Thinking and generating code...";
    currentHtml = ""; // Reset current content

    try {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ prompt })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));
                    if (data.text) {
                        currentHtml += data.text;
                        updatePreview(currentHtml);
                    }
                }
            }
        }

        // Save to Firestore
        currentProjectId = await autoSaveProject(currentHtml, prompt, currentProjectId, auth.currentUser.uid);
        
        previewStatus.innerText = "Generation complete!";
        refineBtn.classList.remove('hidden');
        document.getElementById('deploy-section').classList.remove('hidden');

    } catch (err) {
        console.error(err);
        previewStatus.innerText = "Error generating site.";
    } finally {
        generateBtn.disabled = false;
    }
};

/* ---------------- DEPLOYMENT LOGIC ---------------- */
deployBtn.onclick = async () => {
    const slug = document.getElementById('site-slug').value;
    deployBtn.disabled = true;
    previewStatus.innerText = "Deploying to Vercel...";

    try {
        const res = await fetch('/api/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                htmlContent: currentHtml,
                userId: auth.currentUser.uid,
                plan: userPlan,
                projectId: currentProjectId,
                slug: slug
            })
        });

        const data = await res.json();
        if (data.deploymentUrl) {
            document.getElementById('live-url-box').classList.remove('hidden');
            document.getElementById('live-url').href = data.deploymentUrl;
            document.getElementById('live-url').innerText = data.deploymentUrl;
            previewStatus.innerText = "Site is LIVE!";
        }
    } catch (err) {
        alert("Deploy failed: " + err.message);
    } finally {
        deployBtn.disabled = false;
    }
};

function updatePreview(html) {
    const blob = new Blob([html], { type: 'text/html' });
    previewFrame.src = URL.createObjectURL(blob);
}
