// scripts.js

// Initialize Lucide icons
lucide.createIcons();

// 1. Navbar Active Link Script
const sections = document.querySelectorAll("section[id]");
const navLinks = document.querySelectorAll(".nav-link");

window.addEventListener("scroll", () => {
    let current = "";
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 120;
        if (pageYOffset >= sectionTop) {
            current = section.getAttribute("id");
        }
    });
    navLinks.forEach(link => {
        link.classList.remove("active");
        if (link.getAttribute("href") === "#" + current) {
            link.classList.add("active");
        }
    });
});

// 2. Continuous Scrolling and Hover Pause Script
const featureCarousel = document.getElementById('feature-carousel');
if (featureCarousel) {
    const content = featureCarousel.innerHTML;
    featureCarousel.innerHTML += content;
}

// 3. Mobile Menu Toggle Script
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');
const mobileMenuIconContainer = mobileMenuButton.querySelector('i');

mobileMenuButton.addEventListener('click', () => {
    mobileMenu.classList.toggle('hidden');
    const isMenuOpen = !mobileMenu.classList.contains('hidden');
    
    mobileMenuIconContainer.setAttribute('data-lucide', isMenuOpen ? 'x' : 'menu');
    lucide.createIcons();
});

const mobileNavLinks = mobileMenu.querySelectorAll('a');
mobileNavLinks.forEach(link => {
    link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
        mobileMenuIconContainer.setAttribute('data-lucide', 'menu');
        lucide.createIcons();
    });
});

// 4. Typing Effect Script
var typed = new Typed('#typed-target', {
    strings: ['React App', 'Next.js Site', 'Full Dashboard', 'Landing Page', 'Multi-Page App'],
    typeSpeed: 80,
    backSpeed: 50,
    backDelay: 2000,
    loop: true,
    showCursor: true,
    cursorChar: '|'
});

// 5. Pricing Toggle Logic
const billingToggle = document.getElementById('billing-toggle');
const toggleHandle = document.getElementById('toggle-handle');
const monthlyLabel = document.getElementById('monthly-label');
const yearlyLabel = document.getElementById('yearly-label');

const proPrice = document.getElementById('pro-price');
const proPeriod = document.getElementById('pro-period');
const agencyPrice = document.getElementById('agency-price');
const agencyPeriod = document.getElementById('agency-period');

let isYearly = false;

billingToggle.addEventListener('click', () => {
    isYearly = !isYearly;
    
    if (isYearly) {
        toggleHandle.classList.replace('translate-x-0', 'translate-x-5');
        billingToggle.classList.replace('bg-gray-200', 'bg-ammoue');
        yearlyLabel.classList.replace('text-gray-500', 'text-gray-900');
        monthlyLabel.classList.replace('text-gray-900', 'text-gray-500');
        
        proPrice.textContent = '$15';
        proPeriod.textContent = '/mo (billed yearly)';
        agencyPrice.textContent = '$39';
        agencyPeriod.textContent = '/mo (billed yearly)';
    } else {
        toggleHandle.classList.replace('translate-x-5', 'translate-x-0');
        billingToggle.classList.replace('bg-ammoue', 'bg-gray-200');
        yearlyLabel.classList.replace('text-gray-900', 'text-gray-500');
        monthlyLabel.classList.replace('text-gray-500', 'text-gray-900');
        
        proPrice.textContent = '$19';
        proPeriod.textContent = '/mo';
        agencyPrice.textContent = '$49';
        agencyPeriod.textContent = '/mo';
    }
});

// 6. Modal Control
const starterModal = document.getElementById('starter-modal');
const openStarterBtn = document.getElementById('open-starter-modal');
const closeStarterBtn = document.getElementById('close-starter-modal');
const starterOverlay = document.getElementById('starter-modal-overlay');

const toggleModal = (show) => {
    if (show) {
        starterModal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    } else {
        starterModal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
};

openStarterBtn.addEventListener('click', () => toggleModal(true));
closeStarterBtn.addEventListener('click', () => toggleModal(false));
starterOverlay.addEventListener('click', () => toggleModal(false));
