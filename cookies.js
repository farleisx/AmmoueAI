/* cookies.js */

(function() {
    // 1. Check if user already accepted
    if (localStorage.getItem('ammoue_cookies_accepted')) return;

    // 2. Create the HTML Structure
    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.className = 'fixed bottom-6 left-6 right-6 md:left-auto md:max-w-md z-[100] transform transition-all duration-500 translate-y-20 opacity-0';
    
    banner.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 flex flex-col space-y-4">
            <div class="flex items-start space-x-4">
                <div class="bg-teal-50 p-2 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/></svg>
                </div>
                <div class="flex-1">
                    <h3 class="text-sm font-bold text-gray-900">Cookie Notice</h3>
                    <p class="text-xs text-gray-500 leading-relaxed mt-1">
                        We use essential cookies to make Ammoue AI work and analytics to improve your experience. 
                        By clicking "Accept", you agree to our <a href="/privacy" class="text-ammoue hover:underline font-bold">Privacy Policy</a>.
                    </p>
                </div>
            </div>
            <div class="flex space-x-3">
                <button id="accept-cookies" class="flex-1 bg-ammoue hover:bg-teal-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95">
                    Accept All
                </button>
                <button id="decline-cookies" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2.5 rounded-xl transition-all">
                    Essential Only
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(banner);

    // 3. Animation Trigger
    setTimeout(() => {
        banner.classList.remove('translate-y-20', 'opacity-0');
        banner.classList.add('translate-y-0', 'opacity-100');
    }, 1000);

    // 4. Logic Functions
    const hideBanner = () => {
        banner.classList.add('translate-y-20', 'opacity-0');
        setTimeout(() => banner.remove(), 500);
    };

    document.getElementById('accept-cookies').onclick = () => {
        localStorage.setItem('ammoue_cookies_accepted', 'true');
        hideBanner();
    };

    document.getElementById('decline-cookies').onclick = () => {
        localStorage.setItem('ammoue_cookies_accepted', 'essential');
        hideBanner();
    };
})();
