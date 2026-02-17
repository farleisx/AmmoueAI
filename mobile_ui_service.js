// mobile_ui_service.js
export function initMobileDrawer() {
    const mobileTrigger = document.getElementById('mobile-project-trigger');
    const historyPanel = document.querySelector('.history-panel');
    const drawerClose = document.getElementById('mobile-drawer-close');

    if (mobileTrigger) {
        mobileTrigger.onclick = (e) => {
            e.stopPropagation();
            if (historyPanel) {
                historyPanel.classList.add('mobile-open');
                historyPanel.classList.remove('hidden');
            }
        };

        if (drawerClose) {
            drawerClose.onclick = () => {
                if (historyPanel) historyPanel.classList.remove('mobile-open');
            };
        }

        const projectList = document.getElementById('project-history-list');
        if (projectList) {
            projectList.addEventListener('click', (e) => {
                if (window.innerWidth <= 768 && historyPanel) {
                    if (e.target.closest('div')) {
                        historyPanel.classList.remove('mobile-open');
                    }
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && historyPanel && historyPanel.classList.contains('mobile-open')) {
                if (!historyPanel.contains(e.target) && e.target !== mobileTrigger) {
                    historyPanel.classList.remove('mobile-open');
                }
            }
        });
    }
}
