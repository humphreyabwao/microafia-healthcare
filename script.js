// ========================================
// Microafia Healthcare - JavaScript
// ========================================

// Global function to save callback requests to Firestore
async function saveCallbackRequest(data) {
    if (typeof db === 'undefined') {
        return { success: false, error: 'Firebase not initialized' };
    }
    try {
        const docRef = await db.collection('callback_requests').add({
            name: data.name,
            phone: data.phone,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'pending'
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error saving callback request:', error);
        return { success: false, error: error.message };
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const header = document.querySelector('.header');
    const menuToggle = document.querySelector('.menu-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');

    // ========================================
    // Notification Badge - Real-time Firestore Listeners
    // ========================================
    initNotificationBadge();

    function initNotificationBadge() {
        if (typeof db === 'undefined') return;

        // Get today's date at midnight for filtering
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let totalCount = 0;
        const counts = { appointments: 0, lab_orders: 0, wellness_bookings: 0, contact_messages: 0, callback_requests: 0 };
        const collections = ['appointments', 'lab_orders', 'wellness_bookings', 'contact_messages', 'callback_requests'];

        // Listen to each collection for today's documents
        collections.forEach(collectionName => {
            db.collection(collectionName)
                .where('createdAt', '>=', today)
                .onSnapshot(snapshot => {
                    counts[collectionName] = snapshot.size;
                    totalCount = Object.values(counts).reduce((a, b) => a + b, 0);
                    updateBadge(totalCount);
                }, error => {
                    console.log('Notification listener error:', error);
                });
        });
    }

    function updateBadge(count) {
        const badge1 = document.getElementById('notifBadge1');
        const badge2 = document.getElementById('notifBadge2');

        [badge1, badge2].forEach(badge => {
            if (badge) {
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }
        });
    }

    // ========================================
    // Contact Form - Firebase Submission
    // ========================================
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = this.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            submitBtn.disabled = true;

            const data = {
                name: this.querySelector('[name="name"]').value.trim(),
                phone: this.querySelector('[name="phone"]').value.trim(),
                email: this.querySelector('[name="email"]').value.trim(),
                service: this.querySelector('[name="service"]').value,
                message: this.querySelector('[name="message"]').value.trim()
            };

            try {
                const docRef = await db.collection('contact_messages').add({
                    ...data,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'unread'
                });
                console.log('Contact message saved:', docRef.id);
                showContactMessage('success', 'Message Sent!', 'Thank you for contacting us. We will get back to you shortly.');
                this.reset();
            } catch (error) {
                console.error('Error:', error);
                showContactMessage('error', 'Failed to Send', 'Please try again or call us at +254 740 250 696');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    function showContactMessage(type, title, message) {
        const isSuccess = type === 'success';
        const color = isSuccess ? '#064e3b' : '#dc3545';
        const icon = isSuccess ? 'fa-check-circle' : 'fa-exclamation-circle';

        const overlay = document.createElement('div');
        overlay.id = 'messageOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;';

        const popup = document.createElement('div');
        popup.id = 'messagePopup';
        popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:40px;text-align:center;z-index:10000;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.2);';
        popup.innerHTML = `
            <i class="fas ${icon}" style="font-size:60px;color:${color};margin-bottom:20px;display:block;"></i>
            <h3 style="margin:0 0 15px;color:${color};">${title}</h3>
            <p style="color:#666;margin:0 0 20px;">${message}</p>
            <button onclick="this.parentElement.remove();document.getElementById('messageOverlay').remove();" style="background:${color};color:#fff;border:none;padding:12px 30px;cursor:pointer;font-size:1rem;">OK</button>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(popup);
    }
    const mobileMenuLinks = document.querySelectorAll('.mobile-menu-list > li > a:not(.mobile-dropdown-toggle)');
    const navLinks = document.querySelectorAll('.nav-menu li a');
    const mobileDropdownToggle = document.querySelectorAll('.mobile-dropdown-toggle');
    
    // ========================================
    // Mobile Dropdown Toggle
    // ========================================
    mobileDropdownToggle.forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            const parent = this.parentElement;
            parent.classList.toggle('active');
        });
    });
    
    // Close dropdown when clicking on submenu link
    const mobileSubMenuLinks = document.querySelectorAll('.mobile-dropdown-menu li a');
    mobileSubMenuLinks.forEach(link => {
        link.addEventListener('click', function() {
            menuToggle.classList.remove('active');
            mobileMenu.classList.remove('active');
            document.body.style.overflow = '';
        });
    });
    
    // ========================================
    // Mobile Menu Toggle
    // ========================================
    function toggleMobileMenu() {
        menuToggle.classList.toggle('active');
        mobileMenu.classList.toggle('active');
        
        // Prevent body scroll when menu is open
        if (mobileMenu.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }
    
    menuToggle.addEventListener('click', toggleMobileMenu);
    
    // Close mobile menu when clicking on a link
    mobileMenuLinks.forEach(link => {
        link.addEventListener('click', function() {
            menuToggle.classList.remove('active');
            mobileMenu.classList.remove('active');
            document.body.style.overflow = '';
        });
    });
    
    // ========================================
    // Header Scroll Effect
    // ========================================
    function handleScroll() {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }
    
    window.addEventListener('scroll', handleScroll);
    
    // ========================================
    // Active Navigation Link
    // ========================================
    function setActiveLink(links) {
        links.forEach(link => {
            link.addEventListener('click', function(e) {
                // Remove active class from all links
                links.forEach(l => l.classList.remove('active'));
                // Add active class to clicked link
                this.classList.add('active');
            });
        });
    }
    
    setActiveLink(navLinks);
    setActiveLink(mobileMenuLinks);
    
    // ========================================
    // Smooth Scroll for CTA Buttons
    // ========================================
    const ctaButtons = document.querySelectorAll('.hero-cta .btn');
    
    ctaButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Check if button has a real link (not just #)
            const href = this.getAttribute('href');
            if (href && href !== '#') {
                // Allow the link to work normally
                return;
            }
            
            e.preventDefault();
            // Add ripple effect
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');
            this.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
            
            // Here you would typically navigate to booking or lab service page
            // For now, we'll just show an alert or console log
            const buttonText = this.textContent.trim();
            console.log(`${buttonText} clicked`);
        });
    });
    
    // ========================================
    // Window Resize Handler
    // ========================================
    let resizeTimer;
    
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            // Close mobile menu on resize to desktop
            if (window.innerWidth > 991) {
                menuToggle.classList.remove('active');
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            }
        }, 250);
    });
    
    // ========================================
    // Close mobile menu when clicking outside
    // ========================================
    document.addEventListener('click', function(e) {
        if (!menuToggle.contains(e.target) && !mobileMenu.contains(e.target)) {
            if (mobileMenu.classList.contains('active')) {
                menuToggle.classList.remove('active');
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            }
        }
    });
    
    // ========================================
    // Add animation on load
    // ========================================
    function animateOnLoad() {
        const heroContent = document.querySelector('.hero-content');
        if (heroContent) {
            heroContent.style.opacity = '0';
            heroContent.style.transform = 'translateY(30px)';
            
            setTimeout(() => {
                heroContent.style.transition = 'all 0.8s ease';
                heroContent.style.opacity = '1';
                heroContent.style.transform = 'translateY(0)';
            }, 100);
        }
    }
    
    animateOnLoad();
    
    // ========================================
    // Hero Background Slideshow with Lazy Loading
    // ========================================
    const heroSlides = document.querySelectorAll('.hero-slide');
    let currentSlide = 0;
    
    // Lazy load background images
    function lazyLoadSlide(slide) {
        const bgUrl = slide.getAttribute('data-bg');
        if (bgUrl && !slide.style.backgroundImage) {
            slide.style.backgroundImage = `url('${bgUrl}')`;
        }
    }
    
    // Load first slide immediately
    if (heroSlides[0]) {
        lazyLoadSlide(heroSlides[0]);
    }
    
    // Preload next slide
    function preloadNextSlide(index) {
        const nextIndex = (index + 1) % heroSlides.length;
        if (heroSlides[nextIndex]) {
            lazyLoadSlide(heroSlides[nextIndex]);
        }
    }
    
    function showSlide(index) {
        heroSlides.forEach(slide => slide.classList.remove('active'));
        if (heroSlides[index]) {
            lazyLoadSlide(heroSlides[index]);
            heroSlides[index].classList.add('active');
            preloadNextSlide(index);
        }
        currentSlide = index;
    }
    
    function nextSlide() {
        const next = (currentSlide + 1) % heroSlides.length;
        showSlide(next);
    }
    
    // Start slideshow - change image every 5 seconds
    if (heroSlides.length > 1) {
        // Preload second slide after a short delay
        setTimeout(() => preloadNextSlide(0), 1000);
        setInterval(nextSlide, 5000);
    }
    
    // ========================================
    // Social Media Hover Effects
    // ========================================
    const socialLinks = document.querySelectorAll('.social-links a');
    
    socialLinks.forEach(link => {
        link.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-3px) scale(1.1)';
        });
        
        link.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
    
    // ========================================
    // Button Hover Sound Effect (Optional)
    // ========================================
    // Uncomment below if you want subtle hover feedback
    /*
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            // Play subtle sound or add haptic feedback
        });
    });
    */
    
    // ========================================
    // Intersection Observer for animations
    // ========================================
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
            }
        });
    }, observerOptions);
    
    // Observe elements that need animation
    const animateElements = document.querySelectorAll('.animate-on-scroll');
    animateElements.forEach(el => observer.observe(el));
    
    // ========================================
    // Stats Counter Animation
    // ========================================
    const statNumbers = document.querySelectorAll('.stat-number[data-count]');
    let statsAnimated = false;
    
    function animateCounter(el) {
        const target = parseInt(el.getAttribute('data-count'));
        const suffix = el.getAttribute('data-suffix') || '';
        const duration = 2000;
        const steps = 60;
        const increment = target / steps;
        let current = 0;
        const stepTime = duration / steps;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            el.textContent = Math.floor(current) + suffix;
        }, stepTime);
    }
    
    function checkStatsInView() {
        const statsSection = document.querySelector('.about-stats');
        if (statsSection && !statsAnimated) {
            const rect = statsSection.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            
            if (rect.top < windowHeight - 100) {
                statsAnimated = true;
                statNumbers.forEach(stat => animateCounter(stat));
            }
        }
    }
    
    window.addEventListener('scroll', checkStatsInView);
    checkStatsInView(); // Check on load
    
    // ========================================
    // Callback Modal
    // ========================================
    const callbackModal = document.getElementById('callbackModal');
    const openCallbackBtn = document.getElementById('openCallbackModal');
    const closeCallbackBtn = document.getElementById('closeCallbackModal');
    const callbackForm = document.getElementById('callbackForm');
    
    if (openCallbackBtn && callbackModal) {
        // Open modal
        openCallbackBtn.addEventListener('click', function() {
            callbackModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
        
        // Close modal with X button
        closeCallbackBtn.addEventListener('click', function() {
            callbackModal.classList.remove('active');
            document.body.style.overflow = '';
        });
        
        // Close modal when clicking outside
        callbackModal.addEventListener('click', function(e) {
            if (e.target === callbackModal) {
                callbackModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
        
        // Close modal with Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && callbackModal.classList.contains('active')) {
                callbackModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
        
        // Handle form submission
        callbackForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const name = this.querySelector('[name="callback-name"]').value;
            const phone = this.querySelector('[name="callback-phone"]').value;
            
            // Show loading state
            const submitBtn = this.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            submitBtn.disabled = true;
            
            // Save to Firebase Firestore
            try {
                if (typeof saveCallbackRequest === 'function') {
                    const result = await saveCallbackRequest({ name, phone });
                    if (result.success) {
                        console.log('Callback request saved to Firebase:', result.id);
                        // Show success message
                        showCallbackSuccess();
                        // Reset form and close modal
                        this.reset();
                        callbackModal.classList.remove('active');
                        document.body.style.overflow = '';
                    } else {
                        throw new Error(result.error);
                    }
                } else {
                    throw new Error('Firebase not loaded');
                }
            } catch (error) {
                console.error('Firebase error:', error);
                alert('Failed to submit. Please try again or call us directly.');
            } finally {
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            }
        });
        
        function showCallbackSuccess() {
            const successDiv = document.createElement('div');
            successDiv.className = 'callback-success';
            successDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #fff;
                padding: 40px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                text-align: center;
                z-index: 10001;
                max-width: 400px;
            `;
            successDiv.innerHTML = `
                <i class="fas fa-check-circle" style="font-size: 60px; color: #064e3b; margin-bottom: 20px;"></i>
                <h3 style="margin: 0 0 15px; color: #064e3b;">Request Received!</h3>
                <p style="color: #666; margin: 0 0 20px;">Thank you! We will call you back shortly.</p>
                <button onclick="this.parentElement.remove(); document.querySelector('.callback-overlay').remove();" 
                        style="background: #064e3b; color: #fff; border: none; padding: 12px 30px; cursor: pointer; font-size: 1rem;">
                    OK
                </button>
            `;

            const overlay = document.createElement('div');
            overlay.className = 'callback-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 10000;
            `;

            document.body.appendChild(overlay);
            document.body.appendChild(successDiv);
        }
    }
    
    // ========================================
    // Reviews Carousel (Mobile)
    // ========================================
    const reviewsGrid = document.querySelector('.reviews-grid');
    const reviewCards = document.querySelectorAll('.review-card');
    let currentReview = 0;
    let reviewInterval;
    
    function initReviewsCarousel() {
        if (window.innerWidth <= 767 && reviewCards.length > 0) {
            // Add dots navigation if not exists
            let dotsContainer = document.querySelector('.reviews-dots');
            if (!dotsContainer) {
                dotsContainer = document.createElement('div');
                dotsContainer.className = 'reviews-dots';
                reviewCards.forEach((_, index) => {
                    const dot = document.createElement('span');
                    dot.className = 'reviews-dot' + (index === 0 ? ' active' : '');
                    dot.addEventListener('click', () => goToReview(index));
                    dotsContainer.appendChild(dot);
                });
                reviewsGrid.parentNode.appendChild(dotsContainer);
            }
            
            // Set initial state
            reviewCards.forEach((card, index) => {
                card.classList.remove('active', 'prev');
                if (index === 0) card.classList.add('active');
            });
            
            // Start auto-slide
            startReviewSlider();
        } else {
            // Reset for desktop
            stopReviewSlider();
            reviewCards.forEach(card => {
                card.classList.remove('active', 'prev');
            });
            const dotsContainer = document.querySelector('.reviews-dots');
            if (dotsContainer) dotsContainer.style.display = 'none';
        }
    }
    
    function goToReview(index) {
        reviewCards[currentReview].classList.remove('active');
        reviewCards[currentReview].classList.add('prev');
        
        currentReview = index;
        
        reviewCards.forEach((card, i) => {
            card.classList.remove('active', 'prev');
            if (i === currentReview) card.classList.add('active');
        });
        
        // Update dots
        const dots = document.querySelectorAll('.reviews-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentReview);
        });
        
        // Reset interval
        stopReviewSlider();
        startReviewSlider();
    }
    
    function nextReview() {
        const prevIndex = currentReview;
        currentReview = (currentReview + 1) % reviewCards.length;
        
        reviewCards[prevIndex].classList.remove('active');
        reviewCards[prevIndex].classList.add('prev');
        
        setTimeout(() => {
            reviewCards[prevIndex].classList.remove('prev');
        }, 500);
        
        reviewCards[currentReview].classList.add('active');
        
        // Update dots
        const dots = document.querySelectorAll('.reviews-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentReview);
        });
    }
    
    function startReviewSlider() {
        reviewInterval = setInterval(nextReview, 4000);
    }
    
    function stopReviewSlider() {
        clearInterval(reviewInterval);
    }
    
    // Initialize on load and resize
    initReviewsCarousel();
    window.addEventListener('resize', initReviewsCarousel);

    // ==================== //
    // Scroll to Top Button //
    // ==================== //
    const scrollToTopBtn = document.getElementById('scrollToTop');
    
    if (scrollToTopBtn) {
        // Show/hide button based on scroll position
        window.addEventListener('scroll', function() {
            if (window.scrollY > 500) {
                scrollToTopBtn.classList.add('visible');
            } else {
                scrollToTopBtn.classList.remove('visible');
            }
        });

        // Scroll to top on click
        scrollToTopBtn.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
    
    console.log('Microafia Healthcare website loaded successfully!');
});
