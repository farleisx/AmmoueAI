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

    applyProUiLock(plan === "pro");

    return { count, limit: limitVal, resetAt, plan };
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

function applyProUiLock(isPro) {
    const slugInput = document.getElementById('publish-slug');
    const customDomainInput = document.getElementById('custom-domain-input');
    const existingDomainLock = document.getElementById('domain-locked-overlay');

    if (isPro) {
        if (customDomainInput) {
            customDomainInput.disabled = false;
            customDomainInput.parentElement.parentElement.style.opacity = "1";
        }
        if (existingDomainLock) existingDomainLock.remove();
        if (slugInput) {
            slugInput.disabled = false;
        }
    } else {
        if (customDomainInput && !existingDomainLock) {
            customDomainInput.disabled = true;
            const lock = document.createElement('div');
            lock.id = 'domain-locked-overlay';
            lock.className = "absolute inset-0 bg-black/60 backdrop-blur-[2px] rounded-xl flex items-center justify-between px-4 cursor-pointer group z-10";
            lock.innerHTML = `
                <span class="text-xs text-gray-400 font-medium">Custom Domain</span>
                <div class="flex items-center gap-2">
                    <span class="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded-full font-bold border border-amber-500/20">PRO</span>
                    <i data-lucide="lock" class="w-3.5 h-3.5 text-gray-500 group-hover:text-amber-500 transition"></i>
                </div>
            `;
            lock.onclick = (e) => {
                e.stopPropagation();
                document.getElementById('publish-modal').style.display = 'none';
                document.getElementById('checkout-modal').style.display = 'flex';
            };
            customDomainInput.parentElement.classList.add('relative');
            customDomainInput.parentElement.appendChild(lock);
            customDomainInput.parentElement.parentElement.style.opacity = "0.5";
            lucide.createIcons();
        }
        if (slugInput) {
            slugInput.disabled = false;
        }
    }
}
