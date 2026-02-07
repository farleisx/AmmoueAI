// dashboard-ui.js
import { projectsData, allProjectsArray, timeAgo } from "./dashboard-logic.js";

export function toggleProjectMenu(projectId) {
    const menu = document.getElementById(`menu-${projectId}`);
    if (!menu) return;
    
    document.querySelectorAll('.project-menu').forEach(m => {
        if (m.id !== `menu-${projectId}`) m.classList.remove('active');
    });
    
    menu.classList.toggle('active');
}

export function openExportModal() {
    if (allProjectsArray.length === 0) return;
    const modal = document.getElementById('export-confirm-modal');
    const content = document.getElementById('export-modal-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
}

export function closeExportModal() {
    const modal = document.getElementById('export-confirm-modal');
    const content = document.getElementById('export-modal-content');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }, 300);
}

export function openDeleteModal(projectId) {
    const project = projectsData.get(projectId);
    if (!project) return;
    document.getElementById('delete-project-title').textContent = project.title;
    document.getElementById('confirm-delete-button').setAttribute('data-project-id', projectId);
    const modal = document.getElementById('delete-confirm-modal');
    const content = document.getElementById('delete-modal-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
}

export function closeDeleteModal() {
    const modal = document.getElementById('delete-confirm-modal');
    const content = document.getElementById('delete-modal-content');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }, 300);
}

export function openDeleteAllModal() {
    if (allProjectsArray.length === 0) return;
    document.getElementById('delete-all-count').textContent = allProjectsArray.length;
    const modal = document.getElementById('delete-all-modal');
    const content = document.getElementById('delete-all-modal-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
}

export function closeDeleteAllModal() {
    const modal = document.getElementById('delete-all-modal');
    const content = document.getElementById('delete-all-modal-content');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }, 300);
}

export function openEditModal(projectId) {
    const project = projectsData.get(projectId);
    if (!project) return;
    document.getElementById('edit-project-id').value = projectId;
    document.getElementById('edit-title').value = project.title;
    document.getElementById('edit-prompt').value = project.prompt; 
    const modal = document.getElementById('edit-modal');
    const content = document.getElementById('edit-modal-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
}

export function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    const content = document.getElementById('edit-modal-content');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }, 300);
}

export function renderProjects(projectsToRender) {
    const projectsContainer = document.getElementById('projects-container');
    if (!projectsContainer) return;
    document.getElementById('project-count').textContent = projectsToRender.length;
    
    let projectsHtml = `
        <div onclick="window.location.href='/ai_prompt'"
            class="bg-white/5 border-2 border-dashed border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-ammoue transition duration-300 cursor-pointer hover:shadow-lg min-h-[180px] hover:bg-white/10">
            <i data-lucide="plus-circle" class="w-10 h-10 text-gray-500 mb-2"></i>
            <p class="font-semibold text-gray-200">New AI Site</p>
        </div>
    `;

    if (projectsToRender.length === 0 && allProjectsArray.length === 0) {
        projectsContainer.innerHTML = projectsHtml + `<p class="col-span-full text-center text-gray-500 text-lg mt-10">You don't have any projects yet.</p>`;
        lucide.createIcons();
        return;
    }

    projectsToRender.forEach(project => {
        let lastUpdate = project.updatedAt || project.createdAt;
        let displayTime = lastUpdate ? timeAgo(lastUpdate.toDate()) : "Recently";
        const isDeployed = (project.deploymentUrl && project.deploymentUrl.startsWith('http')) || (project.lastDeploymentUrl && project.lastDeploymentUrl.startsWith('http'));
        
        let contentForIframe = project.htmlContent;
        if (!contentForIframe && project.pages) {
            const pages = project.pages;
            const targetPage = pages['index.html'] || pages['landing'] || Object.values(pages)[0];
            contentForIframe = typeof targetPage === 'object' ? targetPage.content : targetPage;
        }
        const blobUrl = contentForIframe ? URL.createObjectURL(new Blob([contentForIframe], { type: 'text/html' })) : '';

        projectsHtml += `
            <div onclick="window.location.href='/editor?id=${project.id}'"
                class="glass-card rounded-2xl p-5 flex flex-col justify-between shadow-sm hover:shadow-xl transition duration-300 cursor-pointer group relative">
                <div class="mb-4">
                    <div class="flex items-start justify-between mb-2">
                        <span class="${isDeployed ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' : 'bg-white/5 text-gray-400 border border-white/10'} text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                            ${isDeployed ? 'Deployed' : 'Draft'}
                        </span>
                        <div class="relative">
                            <button onclick="event.stopPropagation(); toggleProjectMenu('${project.id}')" class="project-menu-trigger p-1 hover:bg-white/10 rounded-full text-gray-500">
                                <i data-lucide="more-vertical" class="w-4 h-4"></i>
                            </button>
                            <div id="menu-${project.id}" class="project-menu absolute right-0 mt-1 bg-[#0f0f0f] border border-white/10 shadow-2xl rounded-xl p-1 w-40 overflow-hidden">
                                <button onclick="event.stopPropagation(); openEditModal('${project.id}')" class="w-full text-left px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/5 rounded-lg flex items-center">
                                    <i data-lucide="pencil" class="w-3.5 h-3.5 mr-2 text-amber-500"></i> Edit Details
                                </button>
                                <button onclick="event.stopPropagation(); handleCopyCode('${project.id}')" class="w-full text-left px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/5 rounded-lg flex items-center">
                                    <i data-lucide="copy" class="w-3.5 h-3.5 mr-2 text-blue-500"></i> Copy Code
                                </button>
                                <button onclick="event.stopPropagation(); handleDownload('${project.id}')" class="w-full text-left px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/5 rounded-lg flex items-center">
                                    <i data-lucide="download" class="w-3.5 h-3.5 mr-2 text-green-500"></i> Download
                                </button>
                                <hr class="my-1 border-white/5">
                                <button onclick="event.stopPropagation(); openDeleteModal('${project.id}')" class="w-full text-left px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-lg flex items-center">
                                    <i data-lucide="trash-2" class="w-3.5 h-3.5 mr-2"></i> Delete
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="preview-window-container">
                        <div class="preview-placeholder">
                            <i data-lucide="layout" class="w-8 h-8 text-white/10"></i>
                        </div>
                        ${blobUrl ? `<iframe class="preview-iframe" src="${blobUrl}"></iframe>` : ''}
                    </div>

                    <h3 class="text-lg font-bold text-white truncate mb-1">${project.title}</h3>
                    <p class="text-xs text-gray-500 line-clamp-2 h-8">${project.prompt}</p>
                </div>
                <div class="pt-4 border-t border-white/5 flex items-center justify-between">
                    <span class="text-[10px] text-gray-500 font-medium">Last edited · ${displayTime}</span>
                    <button onclick="event.stopPropagation(); handlePreview('${project.id}')" 
                            class="text-ammoue hover:text-teal-300 p-1.5 rounded-lg hover:bg-teal-500/10 transition" title="Preview Site">
                        <i data-lucide="${isDeployed ? 'globe' : 'eye'}" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>
        `;
    });
    projectsContainer.innerHTML = projectsHtml;
    lucide.createIcons();
}
