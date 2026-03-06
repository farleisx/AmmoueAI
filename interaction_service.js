// interaction_service.js
import { runTypingEffect, initVoiceRecognition } from "./bridge_ui.js";

export function initInteractions(recognition, voiceBtn, promptInput) {
    runTypingEffect();
    if (recognition && voiceBtn && promptInput) {
        initVoiceRecognition(recognition, voiceBtn, promptInput);
    }
}
