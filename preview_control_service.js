// preview_control_service.js

export function initPreviewControls(setPreviewSize) {
    const desktopBtn = document.getElementById('view-desktop');
    const tabletBtn = document.getElementById('view-tablet');
    const mobileBtn = document.getElementById('view-mobile');

    if (desktopBtn) desktopBtn.onclick = () => setPreviewSize('desktop');
    if (tabletBtn) tabletBtn.onclick = () => setPreviewSize('tablet');
    if (mobileBtn) mobileBtn.onclick = () => setPreviewSize('mobile');
}

export const setPreviewSize = (type) => {
    const container = document.getElementById('preview-container');
    const frame = document.getElementById('preview-frame');
    const btns = { desktop: 'view-desktop', tablet: 'view-tablet', mobile: 'view-mobile' };
    
    Object.values(btns).forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.remove('text-white', 'bg-white/10');
            btn.classList.add('text-gray-500');
        }
    });
    
    const activeBtn = document.getElementById(btns[type]);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-500');
        activeBtn.classList.add('text-white', 'bg-white/10');
    }

    container.style.transform = 'scale(1)';

    if (type === 'desktop') { 
        container.style.width = '100%';
        container.style.maxWidth = '1100px'; 
        container.style.height = 'auto';
        container.classList.add('aspect-video');
        frame.style.width = '100%'; 
        frame.style.height = '100%';
    }
    else if (type === 'tablet') { 
        container.classList.remove('aspect-video');
        container.style.width = '768px'; 
        container.style.maxWidth = '90%';
        container.style.height = '70vh';
        frame.style.width = '100%';
        frame.style.height = '100%';
        
        const parentWidth = container.parentElement.clientWidth;
        if (parentWidth < 768 + 40) {
            const scale = (parentWidth - 40) / 768;
            container.style.transform = `scale(${scale})`;
            container.style.transformOrigin = 'top center';
        }
    }
    else { 
        container.classList.remove('aspect-video');
        container.style.width = '393px'; 
        container.style.maxWidth = '90%';
        container.style.height = '75vh';
        frame.style.width = '100%';
        frame.style.height = '100%';

        const parentWidth = container.parentElement.clientWidth;
        if (parentWidth < 393 + 40) {
            const scale = (parentWidth - 40) / 393;
            container.style.transform = `scale(${scale})`;
            container.style.transformOrigin = 'top center';
        }
    }
};
