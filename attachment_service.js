/**
 * attachment_service.js
 * Handles image selection, state, and UI rendering for attachments
 */

let attachedImages = [];

export function getAttachedImages() {
    return attachedImages;
}

export function clearAttachments() {
    attachedImages = [];
    renderAttachments();
}

export function initAttachmentService(imageInputId, attachBtnId, rackId, previewModalId, modalImgId) {
    const imageUpload = document.getElementById(imageInputId);
    const attachBtn = document.getElementById(attachBtnId);
    const rack = document.getElementById(rackId);
    const modal = document.getElementById(previewModalId);
    const modalImg = document.getElementById(modalImgId);

    attachBtn?.addEventListener('click', () => imageUpload.click());

    imageUpload?.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            if (attachedImages.length < 4) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imgData = event.target.result;
                    attachedImages.push(imgData);
                    renderAttachments();
                };
                reader.readAsDataURL(file);
            }
        });
        imageUpload.value = ''; 
    });

    window.removeAttachment = (idx) => {
        attachedImages.splice(idx, 1);
        renderAttachments();
    };

    window.previewImage = (src) => {
        modalImg.src = src;
        modal.style.display = 'flex';
    };

    function renderAttachments() {
        if (!rack) return;
        rack.innerHTML = '';
        attachedImages.forEach((img, idx) => {
            const div = document.createElement('div');
            div.className = "relative w-12 h-12 rounded-lg border border-white/10 overflow-hidden group cursor-pointer";
            div.innerHTML = `
                <img src="${img}" class="w-full h-full object-cover" onclick="previewImage('${img}')">
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity" onclick="removeAttachment(${idx})">
                    <i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i>
                </div>
            `;
            rack.appendChild(div);
        });
        if (window.lucide) window.lucide.createIcons();
    }
}
