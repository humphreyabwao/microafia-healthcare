// Imaging Services Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Lazy load hero background image
    const heroSection = document.querySelector('.imaging-hero[data-bg]');
    if (heroSection) {
        const bgImage = heroSection.getAttribute('data-bg');
        const img = new Image();
        img.onload = function() {
            heroSection.style.setProperty('--bg-image', `url('${bgImage}')`);
            heroSection.classList.add('bg-loaded');
        };
        img.src = bgImage;
    }
});
