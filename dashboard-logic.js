// dashboard-logic.js
import { 
    db, 
    appId, 
    logout,
    collection, 
    onSnapshot, 
    query, 
    deleteDoc, 
    doc, 
    Timestamp, 
    updateDoc, 
    getDoc,
    setDoc,
    increment,
    serverTimestamp,
    writeBatch 
} from "./firedashboard.js";

import { where, getDocs } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

export let currentUserId = null;
export let projectsData = new Map();
export let allProjectsArray = [];

export function setCurrentUserId(id) {
    currentUserId = id;
}

export function showMessage(message, isError) {
    const msgBox = document.getElementById('message-box');
    if (!msgBox) return;
    msgBox.textContent = message;
    msgBox.className = 'p-4 rounded-xl shadow-2xl text-white font-semibold fixed top-4 left-1/2 transform -translate-x-1/2 transition-opacity duration-300 z-50';
    msgBox.classList.add(isError ? 'bg-red-500' : 'bg-green-500');
    msgBox.classList.add('opacity-100');
    setTimeout(() => { msgBox.classList.remove('opacity-100'); }, 4000);
}

export function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "Just now";
}

export async function handleLogout() {
    try {
        await logout();
        window.location.href = '/login';
    } catch (error) {
        console.error("Logout failed", error);
    }
}

export function handlePreview(projectId) {
    const project = projectsData.get(projectId);
    if (!project) return;
    if (project.deploymentUrl) {
        window.open(project.deploymentUrl, "_blank");
        return;
    }
    
    let contentToPreview = project.htmlContent;
    if (!contentToPreview && project.pages) {
        const pages = project.pages;
        const targetPage = pages['index.html'] || pages['landing'] || Object.values(pages)[0];
        contentToPreview = typeof targetPage === 'object' ? targetPage.content : targetPage;
    }

    if (!contentToPreview) return;
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
        previewWindow.document.write(contentToPreview);
        previewWindow.document.close();
    }
}

export function handleDownload(projectId) {
    const project = projectsData.get(projectId);
    if (!project) {
        showMessage("No project data found", true);
        return;
    }

    const zip = new JSZip();
    let hasFiles = false;

    if (project.pages && typeof project.pages === 'object') {
        Object.entries(project.pages).forEach(([fileName, fileData]) => {
            const content = typeof fileData === 'object' ? fileData.content : fileData;
            if (content) {
                zip.file(fileName, content);
                hasFiles = true;
            }
        });
    }

    if (!hasFiles && project.htmlContent) {
        zip.file('index.html', project.htmlContent);
        hasFiles = true;
    }

    if (!hasFiles) {
        showMessage("No content available for download", true);
        return;
    }

    const cleanTitle = project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'ammoue_project';
    zip.generateAsync({ type: "blob" }).then(content => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = `${cleanTitle}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    });
}

export async function handleExportAll() {
    window.closeExportModal();
    if (allProjectsArray.length === 0) {
        showMessage("No projects to export.", true);
        return;
    }
    
    const btn = document.getElementById('btn-export-all');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="animate-spin mr-2" data-lucide="loader-2"></i> Zipping...`;
    lucide.createIcons();

    try {
        const zip = new JSZip();
        allProjectsArray.forEach(project => {
            const projectFolder = zip.folder(project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase());
            let hasFiles = false;

            if (project.pages && typeof project.pages === 'object') {
                Object.entries(project.pages).forEach(([fileName, fileData]) => {
                    const content = typeof fileData === 'object' ? fileData.content : fileData;
                    if (content) {
                        projectFolder.file(fileName, content);
                        hasFiles = true;
                    }
                });
            }

            if (!hasFiles && project.htmlContent) {
                projectFolder.file('index.html', project.htmlContent);
            }
        });
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `ammoue_projects_backup_${new Date().toISOString().split('T')[0]}.zip`;
        link.click();
        showMessage("Export successful!", false);
    } catch (err) {
        console.error(err);
        showMessage("Export failed.", true);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        lucide.createIcons();
    }
}

export function handleCopyCode(projectId) {
    const project = projectsData.get(projectId);
    if (!project) return;
    
    let contentToCopy = project.htmlContent;
    if (!contentToCopy && project.pages) {
        const pages = project.pages;
        const targetPage = pages['index.html'] || pages['landing'] || Object.values(pages)[0];
        contentToCopy = typeof targetPage === 'object' ? targetPage.content : targetPage;
    }

    if (!contentToCopy) return;
    navigator.clipboard.writeText(contentToCopy).then(() => showMessage("Code copied!", false));
}

export async function executeDeleteProject(projectId) {
    try {
        const docRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'projects', projectId);
        await deleteDoc(docRef);
        showMessage("Project deleted.", false);
        window.closeDeleteModal();
    } catch (e) { showMessage("Error deleting project", true); }
}

export async function executeDeleteAllProjects() {
    const total = allProjectsArray.length;
    try {
        const batch = writeBatch(db);
        allProjectsArray.forEach(p => {
            const docRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'projects', p.id);
            batch.delete(docRef);
        });
        await batch.commit();
        showMessage(`Successfully deleted ${total} projects.`, false);
        window.closeDeleteAllModal();
    } catch (e) {
        console.error(e);
        showMessage("Failed to delete all projects.", true);
    }
}

export async function handleEditFormSubmit(e) {
    e.preventDefault();
    const projectId = document.getElementById('edit-project-id').value;
    const newTitle = document.getElementById('edit-title').value.trim();
    const newPrompt = document.getElementById('edit-prompt').value.trim();
    try {
        const docRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'projects', projectId);
        await updateDoc(docRef, {
            projectName: newTitle, 
            prompt: newPrompt,
            updatedAt: Timestamp.fromDate(new Date())
        });
        window.closeEditModal();
        showMessage("Project updated.", false);
    } catch (e) { showMessage("Error updating project", true); }
}

export function filterProjects(query, renderCallback) {
    const searchTerm = query.toLowerCase().trim();
    let filteredProjects = allProjectsArray;
    if (searchTerm) {
        filteredProjects = allProjectsArray.filter(project => 
            project.title.toLowerCase().includes(searchTerm) ||
            project.prompt.toLowerCase().includes(searchTerm)
        );
    }
    renderCallback(filteredProjects);
}

export function getProjects(userId, renderCallback) {
    const projectsRef = collection(db, 'artifacts', appId, 'users', userId, 'projects');
    const q = query(projectsRef);
    onSnapshot(q, (snapshot) => {
        const projects = [];
        projectsData.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            const project = {
                id: doc.id,
                ...data,
                title: data.projectName || data.title || "Untitled Project",
                prompt: data.prompt ? data.prompt.replace(/\\n/g, '\n') : "No prompt available",
                htmlContent: data.htmlContent || '',
                pages: data.pages || null,
                deploymentUrl: data.lastDeploymentUrl || data.deploymentUrl || null
            };
            projectsData.set(doc.id, project);
            projects.push(project);
        });
        projects.sort((a, b) => {
            const timeA = (a.updatedAt || a.createdAt)?.toMillis() || 0;
            const timeB = (b.updatedAt || b.createdAt)?.toMillis() || 0;
            return timeB - timeA;
        });
        allProjectsArray = projects;
        const searchVal = document.getElementById('project-search')?.value || '';
        filterProjects(searchVal, renderCallback);
    });
}

export async function loadUserPlanAndGateContent(user, userEmailSpan, currentPlanEl, proContent, upgradeCardWrapper) {
    try {
        const userDocRef = doc(db, "users", user.uid);
        
        onSnapshot(userDocRef, (userDoc) => {
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const plan = userData.plan === "pro" ? "pro" : "free";
                const count = userData.dailyCount || 0;
                
                const limitValue = plan === "pro" ? 10 : 5;
                const remaining = Math.max(0, limitValue - count);

                userEmailSpan.textContent = userData.username || user.email || user.uid;

                currentPlanEl.textContent = plan.toUpperCase();
                currentPlanEl.className = `text-xl font-extrabold ${plan === "pro" ? "text-yellow-500" : "text-ammoue"}`;

                const creditEl = document.getElementById('user-credits');
                const progressEl = document.getElementById('credit-progress');
                const popUpgradeBtn = document.getElementById('pop-upgrade-btn');
                const warningBadge = document.getElementById('low-credit-warning');

                if (creditEl) {
                    creditEl.textContent = remaining;
                    if (remaining <= 1) {
                        creditEl.classList.add('text-red-500');
                        creditEl.classList.remove('text-white');
                    } else {
                        creditEl.classList.remove('text-red-500');
                        creditEl.classList.add('text-white');
                    }
                }

                if (progressEl) {
                    const percentage = Math.min((remaining / limitValue) * 100, 100);
                    progressEl.style.width = `${percentage}%`;
                    if (remaining <= 1) {
                        progressEl.className = 'h-full transition-all duration-1000 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]';
                    } else if (remaining <= 2 && plan === "free") {
                        progressEl.className = 'h-full transition-all duration-1000 bg-yellow-500';
                    } else {
                        progressEl.className = 'h-full transition-all duration-1000 bg-ammoue shadow-[0_0_10px_rgba(45,212,191,0.4)]';
                    }
                }

                if (warningBadge) {
                    if (remaining <= 1) {
                        warningBadge.classList.remove('hidden');
                        warningBadge.classList.add('flex');
                    } else {
                        warningBadge.classList.add('hidden');
                        warningBadge.classList.remove('flex');
                    }
                }

                if (plan === "pro") {
                    proContent.classList.remove('hidden');
                    upgradeCardWrapper.innerHTML = '';
                    if (popUpgradeBtn) popUpgradeBtn.classList.add('hidden');
                } else {
                    proContent.classList.add('hidden');
                    upgradeCardWrapper.innerHTML = `<button onclick="handleUpgradeClick()" class="px-4 py-2 text-sm font-semibold rounded-xl text-white bg-yellow-500 hover:bg-yellow-600 shadow-md transition-transform hover:scale-105">Upgrade</button>`;
                    if (popUpgradeBtn) popUpgradeBtn.classList.remove('hidden');
                }
                
                window.currentUserPlan = plan;

                if (typeof window.renderProjects === 'function' && allProjectsArray.length > 0) {
                    window.renderProjects(allProjectsArray);
                }
            }
        });
    } catch (e) { console.error(e); }
}

export async function incrementCounter(userId, field) {
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, {
      [field]: increment(1),
      lastActive: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.error(`Failed to increment ${field}:`, e);
  }
}

export async function getUsage(userId) {
  try {
    const ref = doc(db, "users", userId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data();
    }
    return { dailyCount: 0, plan: "free", dailyResetAt: 0 };
  } catch (e) {
    console.error("Failed to fetch usage:", e);
    return { dailyCount: 0, plan: "free", dailyResetAt: 0 };
  }
}

export async function executeTransferProject() {
    const projectId = document.getElementById('transfer-project-id').value;
    const recipientEmail = document.getElementById('transfer-email').value.trim().toLowerCase();
    
    if (!recipientEmail) {
        showMessage("Please enter a valid email.", true);
        return;
    }

    if (window.currentUserPlan !== 'pro') {
        showMessage("Transferring projects is a PRO feature.", true);
        return;
    }

    const btn = document.getElementById('confirm-transfer-button');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Processing...";

    try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("email", "==", recipientEmail));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showMessage("Recipient user not found.", true);
            btn.disabled = false;
            btn.innerText = originalText;
            return;
        }

        const recipientUid = querySnapshot.docs[0].id;
        if (recipientUid === currentUserId) {
            showMessage("You cannot transfer to yourself.", true);
            btn.disabled = false;
            btn.innerText = originalText;
            return;
        }

        const project = projectsData.get(projectId);
        const { id, title, prompt, ...restData } = project;

        const batch = writeBatch(db);
        const originalRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'projects', projectId);
        // MODIFIED: Document ID is now set explicitly to projectId
        const pendingRef = doc(db, 'pendingTransfers', projectId);

        batch.set(pendingRef, {
            ...restData,
            originalProjectId: projectId,
            projectName: title,
            prompt: prompt,
            senderId: currentUserId,
            senderEmail: document.getElementById('user-email-display')?.textContent || 'Someone',
            recipientId: recipientUid,
            recipientEmail: recipientEmail,
            status: 'pending',
            transferredAt: serverTimestamp()
        });

        batch.delete(originalRef);
        await batch.commit();

        window.closeTransferModal();
        showMessage(`Transfer request sent to ${recipientEmail}`, false);
    } catch (err) {
        console.error(err);
        showMessage("Transfer failed.", true);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

export function listenForPendingTransfers(userId, callback) {
    const q = query(collection(db, "pendingTransfers"), where("recipientId", "==", userId));
    onSnapshot(q, (snapshot) => {
        const transfers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(transfers);
    });
}

export async function handleAcceptTransfer(transfer) {
    try {
        const batch = writeBatch(db);
        const { id, senderId, recipientId, originalProjectId, ...projectData } = transfer;
        const newProjectRef = doc(db, 'artifacts', appId, 'users', recipientId, 'projects', originalProjectId);
        const pendingRef = doc(db, 'pendingTransfers', id);
        batch.set(newProjectRef, { 
            ...projectData, 
            updatedAt: serverTimestamp(),
            acceptedAt: serverTimestamp() 
        });
        batch.delete(pendingRef);
        await batch.commit();
        showMessage("Project accepted!", false);
    } catch (e) { showMessage("Failed to accept.", true); }
}

export async function handleRejectTransfer(transfer) {
    try {
        const batch = writeBatch(db);
        const { id, senderId, recipientId, originalProjectId, senderEmail, recipientEmail, status, transferredAt, ...projectData } = transfer;
        
        const senderProjectRef = doc(db, 'artifacts', appId, 'users', senderId, 'projects', originalProjectId);
        const pendingRef = doc(db, 'pendingTransfers', id);
        
        batch.set(senderProjectRef, { 
            ...projectData, 
            updatedAt: serverTimestamp()
        });
        
        batch.delete(pendingRef);
        await batch.commit();
        showMessage("Project returned to sender.", false);
    } catch (e) { 
        console.error("CRITICAL REJECT ERROR:", e.code, e.message);
        showMessage("Error rejecting.", true); 
    }
}
