// attachment_service.js file
let attachedImages = [];
let uploadInput, attachBtn, rack, previewModal, modalImg;

export function initAttachmentService(inputId, btnId, rackId, modalId, imgId) {
    uploadInput = document.getElementById(inputId);
    attachBtn = document.getElementById(btnId);
    rack = document.getElementById(rackId);
    previewModal = document.getElementById(modalId);
    modalImg = document.getElementById(imgId);

    if (attachBtn) attachBtn.onclick = () => uploadInput.click();
    if (uploadInput) uploadInput.onchange = handleUpload;
}

function handleUpload(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            attachedImages.push(event.target.result);
            renderAttachments();
        };
        reader.readAsDataURL(file);
    });
}

function renderAttachments() {
    if (!rack) return;
    rack.innerHTML = attachedImages.map((src, index) => `
        <div class="relative group w-12 h-12">
            <img src="${src}" onclick="window.previewImage('${src}')" class="w-full h-full object-cover rounded-lg border border-white/10 cursor-zoom-in">
            <button onclick="window.removeAttachment(${index})" class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition">
                <i data-lucide="x" class="w-3 h-3"></i>
            </button>
        </div>
    `).join('');
    if (window.lucide) window.lucide.createIcons();
}

window.previewImage = (src) => {
    if (previewModal && modalImg) {
        modalImg.src = src;
        previewModal.style.display = 'flex';
    }
};

window.removeAttachment = (index) => {
    attachedImages.splice(index, 1);
    renderAttachments();
};

export function getAttachedImages() {
    return attachedImages;
}

export function clearAttachments() {
    attachedImages = [];
    renderAttachments();
}
