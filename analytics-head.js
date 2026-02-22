// /* analytics-head.js */

// Initialize the dataLayer for Google Analytics
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}

// 1. IMMEDIATE LOCKDOWN (Strict Compliance)
// This must execute before any other tracking scripts.
gtag('consent', 'default', {
  'ad_storage': 'denied',
  'analytics_storage': 'denied',
  'wait_for_update': 500
});

// 2. LOAD GOOGLE ANALYTICS SCRIPT DYNAMICALLY
// This keeps your HTML clean and ensures the library is present.
(function() {
    const trackingId = 'G-XXXXXXXXXX'; // REPLACE THIS WITH YOUR REAL ID
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${trackingId}`;
    document.head.appendChild(script);

    gtag('js', new Date());
    gtag('config', trackingId);
})();
