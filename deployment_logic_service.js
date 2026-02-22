// deployment_logic_service.js
export async function executeDeploymentFlow(context) {
    const { getProjectId, getUser, getProjectFiles, db, doc, updateDoc, showCustomAlert } = context;
    const currentProjectId = getProjectId();
    const currentUser = getUser();
    const projectFiles = getProjectFiles();

    const slugInput = document.getElementById('publish-slug');
    const customDomainInput = document.getElementById('custom-domain-input');
    const projectNameDisplay = document.getElementById('project-name-display');
    
    const usageResponse = await fetch(`/api/usage?uid=${currentUser.uid}`);
    const usageData = await usageResponse.json();
    const isPro = usageData.plan === 'pro';

    const slug = (slugInput && slugInput.value && isPro) ? slugInput.value : (projectNameDisplay ? projectNameDisplay.innerText : null);
    const customDomain = (customDomainInput && customDomainInput.value && isPro) ? customDomainInput.value.trim() : null;
    
    if (!currentProjectId) {
        document.getElementById('publish-modal').style.display = 'none';
        showCustomAlert("Hold on!", "You need to save or generate a project before publishing.");
        return;
    }
    const btn = document.getElementById('confirm-publish');
    const originalContent = `<i data-lucide="rocket" class="w-4 h-4"></i> Deploy Now`;
    const progressContainer = document.getElementById('publish-progress-container');
    const progressBar = document.getElementById('publish-progress-bar');
    const progressText = document.getElementById('publish-progress-text');
    const redeployBtn = document.getElementById('redeploy-btn');
    const linkArea = document.getElementById('deployment-link-area');

    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>`;
    lucide.createIcons();

    if(progressContainer) progressContainer.classList.remove('hidden');
    if(redeployBtn) redeployBtn.classList.add('hidden');
    if(linkArea) linkArea.classList.add('hidden');
    
    const updateProgress = (pct, msg) => {
        if(progressBar) progressBar.style.width = `${pct}%`;
        if(progressText) progressText.innerText = msg;
    };

    let timerExpired = false;
    let finalDeploymentUrl = null;
    setTimeout(() => {
        timerExpired = true;
        if (finalDeploymentUrl) {
            btn.innerHTML = "See Deployment";
            btn.disabled = false;
            btn.onclick = () => window.open(finalDeploymentUrl, '_blank');
            if(redeployBtn) redeployBtn.classList.remove('hidden');
        }
    }, 30000);

    try {
        updateProgress(10, "Initializing deployment...");
        const idToken = await currentUser.getIdToken();
        updateProgress(30, "Optimizing assets...");
        
        projectFiles['vercel.json'] = JSON.stringify({ 
            "version": 2, 
            "cleanUrls": true, 
            "trailingSlash": false,
            "outputDirectory": "." 
        }, null, 2);

        const firebaseConfig = {
            apiKey: "AIzaSyAmnZ69YDcEFcmuXIhmGxDUSPULxpI-Bmg",
            authDomain: "ammoueai.firebaseapp.com",
            projectId: "ammoueai",
            storageBucket: "ammoueai.firebasestorage.app",
            messagingSenderId: "135818868149",
            appId: "1:135818868149:web:db9280baf9540a3339d5fc"
        };

        const relayScript = `
        <script type="module">
          import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
          import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
          const app = initializeApp(${JSON.stringify(firebaseConfig)});
          const db = getFirestore(app);
          const sendLog = async (msg) => {
            try { await addDoc(collection(db, "artifacts", "ammoueai", "projects", "${currentProjectId}", "live_logs"), {
              message: msg, type: "error", timestamp: serverTimestamp()
            }); } catch(e) {}
          };
          window.onerror = (m, u, l, c, e) => sendLog(m + " at line " + l);
          const orig = console.error;
          console.error = (...args) => { sendLog(args.join(" ")); orig.apply(console, args); };
        </script>`;

        if (projectFiles['index.html']) {
            projectFiles['index.html'] = projectFiles['index.html'].replace('</head>', relayScript + '</head>');
        }

        updateProgress(50, customDomain ? "Configuring custom domain..." : "Uploading files to Vercel...");
        
        const deployResponse = await fetch('/api/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ 
                projectId: currentProjectId, 
                slug, 
                files: projectFiles,
                customDomain: customDomain
            })
        });

        if (!deployResponse.ok) {
            const errData = await deployResponse.json();
            if (deployResponse.status === 409) throw new Error("SLUG_TAKEN");
            else if (deployResponse.status === 403) throw new Error("LIMIT_REACHED");
            else throw new Error(errData.message || "Deployment failed");
        }

        const res = await deployResponse.json();
        const deploymentId = res.id || res.deploymentId;
        let isReady = false;
        let attempts = 0;

        while (!isReady && attempts < 60) {
            const checkRes = await fetch(`/api/check-deployment?deploymentId=${deploymentId}`);
            const statusData = await checkRes.json();
            
            if (statusData.status === 'READY') {
                isReady = true;
                
                if (customDomain) {
                    finalDeploymentUrl = `https://${customDomain}`;
                    updateProgress(100, "DNS Setup Required");
                    
                    if(linkArea) {
                        linkArea.innerHTML = `
                            <div class="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-left">
                                <p class="text-white text-[11px] font-bold mb-2 flex items-center gap-2">
                                    <i data-lucide="info" class="w-3 h-3 text-emerald-400"></i> DNS Settings for ${customDomain}
                                </p>
                                <div class="space-y-3 font-mono text-[10px]">
                                    <div class="flex flex-col gap-1 border-b border-white/5 pb-2">
                                        <span class="text-gray-500">A Record (@)</span>
                                        <span class="text-emerald-400 select-all">76.76.21.21</span>
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <span class="text-gray-500">CNAME Record (www)</span>
                                        <span class="text-emerald-400 select-all">cname.vercel-dns.com</span>
                                    </div>
                                </div>
                                <p class="text-[9px] text-gray-500 mt-3 italic">Changes can take 24-48h to propagate.</p>
                                <a href="${finalDeploymentUrl}" target="_blank" class="block text-center bg-white/5 hover:bg-white/10 text-white py-2 rounded-lg mt-4 transition-colors">Check Domain Status</a>
                            </div>
                        `;
                        linkArea.classList.remove('hidden');
                        lucide.createIcons();
                    }
                } else {
                    finalDeploymentUrl = `https://${slug}.vercel.app`;
                    updateProgress(100, "Site is live!");
                    
                    if(linkArea) {
                        linkArea.innerHTML = `<a href="${finalDeploymentUrl}" target="_blank" class="text-emerald-400 text-xs font-mono hover:underline flex items-center justify-center gap-1 mt-2"><i data-lucide="external-link" class="w-3 h-3"></i> ${finalDeploymentUrl}</a>`;
                        linkArea.classList.remove('hidden');
                        lucide.createIcons();
                    }
                }
                
                const projectRef = doc(db, "artifacts", "ammoueai", "users", currentUser.uid, "projects", currentProjectId);
                await updateDoc(projectRef, { lastDeploymentUrl: finalDeploymentUrl });

                if (!timerExpired && !customDomain) {
                    setTimeout(() => {
                        window.open(finalDeploymentUrl, '_blank');
                        document.getElementById('publish-modal').style.display = 'none';
                    }, 1000);
                } else if (!timerExpired && customDomain) {
                    btn.innerHTML = "Finish Setup";
                    btn.disabled = false;
                    btn.onclick = () => { document.getElementById('publish-modal').style.display = 'none'; };
                }
            } else if (statusData.status === 'ERROR' || statusData.status === 'FAILED') {
                throw new Error("Vercel build failed.");
            } else {
                attempts++;
                updateProgress(Math.min(95, 50 + (attempts * 4)), "Vercel is building your site...");
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    } catch (e) {
        if (e.message === "SLUG_TAKEN") showCustomAlert("Name Conflict", "URL slug taken.");
        else if (e.message === "LIMIT_REACHED") {
            showCustomAlert("Limit Reached", "Upgrade to Pro.");
            document.getElementById('publish-modal').style.display = 'none';
            document.getElementById('checkout-modal').style.display = 'flex';
        } else showCustomAlert("Publish Failed", e.message);
    } finally {
        if (!timerExpired && !finalDeploymentUrl) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
            lucide.createIcons();
        }
    }
}

export function initDeploymentLogic(context) {
    const { executeDeploymentFlow } = context;
    if (document.getElementById('publish-btn')) {
        document.getElementById('publish-btn').onclick = () => {
            const currentName = document.getElementById('project-name-display').innerText;
            const slugInput = document.getElementById('publish-slug');
            if (slugInput && currentName) slugInput.value = currentName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            document.getElementById('publish-modal').style.display = 'flex';
        };
    }
    if (document.getElementById('confirm-publish')) {
        document.getElementById('confirm-publish').onclick = executeDeploymentFlow;
    }
    if (document.getElementById('redeploy-btn')) {
        document.getElementById('redeploy-btn').onclick = executeDeploymentFlow;
    }
}
