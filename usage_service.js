// usage_service.js
import { getUsage } from "./fire_prompt.js";
import { updateCountdown } from "./ui_service.js";

export async function syncUsage(currentUser) {
    if (!currentUser) return null;
    const usage = await getUsage(currentUser.uid);
    const plan = usage.plan === "pro" ? "pro" : "free";
    const limitVal = plan === "pro" ? 10 : 5;
    const count = usage.dailyCount || 0;
    const resetAt = usage.dailyResetAt || (Date.now() + 86400000);
    
    const creditEl = document.getElementById('credit-display');
    if (creditEl) {
        creditEl.innerText = `Credits: ${limitVal}/${count}`;
        if (count >= limitVal && Date.now() < resetAt) {
            creditEl.classList.add('text-red-500', 'bg-red-500/10');
            creditEl.classList.remove('text-white/40', 'bg-white/5');
        } else {
            creditEl.classList.remove('text-red-500', 'bg-red-500/10');
            creditEl.classList.add('text-white/40', 'bg-white/5');
        }
    }
    return { count, limit: limitVal, resetAt };
}

export function startCountdown(resetAt, onTick, onComplete) {
    if (window.usageInterval) clearInterval(window.usageInterval);
    window.usageInterval = setInterval(() => {
        const now = Date.now();
        const timeLeft = Math.max(0, Math.floor((resetAt - now) / 1000));
        onTick(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(window.usageInterval);
            onComplete();
        }
    }, 1000);
}
