// generation_service_logic.js
import { 
    updateGenerateButtonToStop, 
    resetGenerateButton, 
    renderFileTabsFromRaw, 
    addAiActionLine, 
    clearAiActions 
} from "./generation_ui_service.js";
import { 
    updateFileTabsUI, 
    displayActiveFile, 
    updateSaveIndicator, 
    showLoadingSkeleton, 
    showActionLine 
} from "./project_ui_service.js";
import { showCustomAlert } from "./bridge_ui.js";
import { clearAttachments } from "./attachment_service.js";
import { generateCoolName } from "./download_service.js";

export async function handleGeneration(context) {
    let { 
        currentUser, 
        currentProjectId, 
        projectFiles, 
        activeFile, 
        isGenerating, 
        currentUsageData, 
        abortController, 
        bridge, 
        db, 
        autoSaveProject, 
        generateProjectStream, 
        syncUsageData, 
        refreshFiles 
    } = context;

    const isCooldownOver = Date.now() >= currentUsageData.resetAt;
    if (currentUsageData.count >= currentUsageData.limit && !isGenerating && !isCooldownOver) {
        const display = document.getElementById('credit-display');
        display.classList.add('animate-shake', 'brightness-150');
        setTimeout(() => display.classList.remove('animate-shake', 'brightness-150'), 500);
        document.getElementById('checkout-modal').style.display = 'flex';
        return;
    }

    if (isGenerating) {
        if (abortController) abortController.abort();
        resetGenerateButton();
        return { isGenerating: false, abortController: null, currentProjectId, projectFiles };
    }

    const promptInput = document.getElementById('prompt-input');
    const prompt = promptInput ? promptInput.value : "";
    const idToken = await currentUser.getIdToken();
    
    isGenerating = true;
    abortController = new AbortController();
    updateGenerateButtonToStop();
    clearAiActions();
    updateSaveIndicator("Saving...");
    showLoadingSkeleton(true);
    const startTime = Date.now();

    if (!currentProjectId) {
        const coolName = generateCoolName();
        currentProjectId = await autoSaveProject({}, prompt, null, currentUser.uid, "Start", "landing", coolName);
        const nameDisplay = document.getElementById('project-name-display');
        if (nameDisplay) nameDisplay.innerText = coolName;
    }

    const codeSidebar = document.getElementById('code-sidebar');
    if (codeSidebar) codeSidebar.classList.add('open');

    let fullRawText = "";
    try {
        await generateProjectStream(prompt, "vanilla", currentProjectId, idToken, 
            (chunk) => {
                fullRawText += chunk;
                projectFiles = renderFileTabsFromRaw(fullRawText, activeFile);
                updateFileTabsUI(projectFiles, activeFile);
                displayActiveFile(projectFiles, activeFile);
                if (projectFiles[activeFile]) bridge.update(projectFiles[activeFile]);
            },
            async (statusUpdate) => {
                if (statusUpdate && statusUpdate.status === 'completed') {
                    await syncUsageData();
                    await refreshFiles();
                    resetGenerateButton();
                    isGenerating = false;
                    updateSaveIndicator("Saved");
                    showLoadingSkeleton(false);
                    showActionLine(`Built in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
                }
            },
            (file) => {
                const status = document.getElementById('thinking-status');
                if (status) status.innerText = `Writing ${file}...`;
            },
            (actionName) => {
                addAiActionLine(actionName);
            },
            abortController.signal
        );
    } catch (err) {
        if (err.name !== 'AbortError') {
            showCustomAlert("Generation Error", err.message);
            updateSaveIndicator("Error saving");
        }
        showLoadingSkeleton(false);
        resetGenerateButton();
        isGenerating = false;
    } finally {
        const status = document.getElementById('thinking-status');
        if (status) status.innerText = 'Idle';
        clearAttachments();
    }

    return { isGenerating, abortController, currentProjectId, projectFiles };
}
