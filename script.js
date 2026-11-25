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
    // Only shows NEW items added within last 12 hours that are unread/pending
    // ========================================
    initNotificationBadge();

    function initNotificationBadge() {
        if (typeof db === 'undefined') return;

        // Get timestamp for 12 hours ago
        const twelveHoursAgo = new Date();
        twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

        let totalCount = 0;
        const counts = { appointments: 0, lab_orders: 0, wellness_bookings: 0, contact_messages: 0, callback_requests: 0 };
        
        // Collection configurations with their "unreviewed" status field
        const collections = [
            { name: 'appointments', statusField: 'status', unreviewedStatuses: ['pending', 'new'] },
            { name: 'lab_orders', statusField: 'status', unreviewedStatuses: ['pending', 'new', 'submitted'] },
            { name: 'wellness_bookings', statusField: 'status', unreviewedStatuses: ['pending', 'new'] },
            { name: 'contact_messages', statusField: 'status', unreviewedStatuses: ['unread', 'new'] },
            { name: 'callback_requests', statusField: 'status', unreviewedStatuses: ['pending', 'new'] }
        ];

        // Listen to each collection for recent unreviewed documents only
        collections.forEach(collection => {
            db.collection(collection.name)
                .where('createdAt', '>=', twelveHoursAgo)
                .onSnapshot(snapshot => {
                    // Filter only unreviewed items (not yet seen by admin)
                    let unreviewedCount = 0;
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        const status = data[collection.statusField] || 'new';
                        // Only count if status indicates it hasn't been reviewed
                        if (collection.unreviewedStatuses.includes(status.toLowerCase())) {
                            unreviewedCount++;
                        }
                    });
                    counts[collection.name] = unreviewedCount;
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
    // Mobile navigation
    // ========================================
    mobileMenu.id = 'mobile-site-menu';
    mobileMenu.setAttribute('role', 'navigation');
    mobileMenu.setAttribute('aria-label', 'Mobile navigation');
    mobileMenu.setAttribute('aria-hidden', 'true');
    mobileMenu.inert = true;
    menuToggle.setAttribute('aria-controls', mobileMenu.id);
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
    document.querySelector('.upper-nav .btn-signin')?.setAttribute('aria-label', 'Staff sign in');

    const menuHeading = document.createElement('div');
    menuHeading.className = 'mobile-menu-heading';
    menuHeading.textContent = 'Explore Microafia';
    mobileMenu.prepend(menuHeading);
    const menuActions = document.createElement('div');
    menuActions.className = 'mobile-menu-actions';
    menuActions.innerHTML = '<a class="mobile-book-link" href="/book-appointment">Book a consultation <i class="fas fa-arrow-right" aria-hidden="true"></i></a><a class="mobile-call-link" href="tel:+254740250696"><i class="fas fa-phone-alt" aria-hidden="true"></i> Call us</a>';
    mobileMenu.appendChild(menuActions);

    const menuIcons = ['fa-house', 'fa-heart-pulse', 'fa-stethoscope', 'fa-user-doctor', 'fa-leaf', 'fa-location-dot'];
    mobileMenu.querySelectorAll('.mobile-menu-list > li').forEach((item, index) => {
        const icon = document.createElement('i');
        icon.className = `fas ${menuIcons[index] || 'fa-circle'} mobile-menu-icon`;
        icon.setAttribute('aria-hidden', 'true');
        item.querySelector(':scope > a').prepend(icon);
    });

    const menuBackdrop = document.createElement('div');
    menuBackdrop.className = 'mobile-menu-backdrop';
    menuBackdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(menuBackdrop);
    let menuPreviousOverflow = '';
    let menuCloseTimer;

    function setMobileMenu(open, restoreFocus = false) {
        if (open === mobileMenu.classList.contains('active')) return;
        if (open) menuPreviousOverflow = document.body.style.overflow;
        menuToggle.classList.toggle('active', open);
        mobileMenu.classList.toggle('active', open);
        clearTimeout(menuCloseTimer);
        if (open) header.classList.add('menu-open');
        else menuCloseTimer = setTimeout(() => {
            header.classList.remove('menu-open');
            mobileDropdownToggle.forEach(toggle => setMobileDropdown(toggle, false));
        }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420);
        menuBackdrop.classList.toggle('active', open);
        menuToggle.setAttribute('aria-expanded', String(open));
        menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        mobileMenu.setAttribute('aria-hidden', String(!open));
        mobileMenu.inert = !open;
        document.body.style.overflow = open ? 'hidden' : menuPreviousOverflow;
        if (restoreFocus) menuToggle.focus();
    }

    function setMobileDropdown(toggle, open) {
        const parent = toggle.parentElement;
        const submenu = parent.querySelector('.mobile-dropdown-menu');
        if (open) submenu.style.setProperty('--submenu-height', `${submenu.scrollHeight}px`);
        parent.classList.toggle('active', open);
        toggle.setAttribute('aria-expanded', String(open));
        submenu.inert = !open;
    }

    mobileDropdownToggle.forEach((toggle, index) => {
        const submenu = toggle.parentElement.querySelector('.mobile-dropdown-menu');
        submenu.id = `mobile-submenu-${index}`;
        submenu.inert = true;
        toggle.setAttribute('aria-controls', submenu.id);
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('role', 'button');
        toggle.addEventListener('click', event => {
            event.preventDefault();
            const open = !toggle.parentElement.classList.contains('active');
            mobileDropdownToggle.forEach(other => setMobileDropdown(other, other === toggle && open));
        });
        toggle.addEventListener('keydown', event => {
            if (event.key === ' ') { event.preventDefault(); toggle.click(); }
        });
    });

    menuToggle.addEventListener('click', () => setMobileMenu(!mobileMenu.classList.contains('active')));
    menuBackdrop.addEventListener('click', () => setMobileMenu(false));
    mobileMenu.querySelectorAll('a:not(.mobile-dropdown-toggle)').forEach(link => {
        link.addEventListener('click', () => setMobileMenu(false));
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && mobileMenu.classList.contains('active')) {
            event.preventDefault();
            setMobileMenu(false, true);
        }
    });

    // ========================================
    // Header Scroll Effect
    // ========================================
    // Collapse the mobile contact tier without shifting page content.
    // Different show/hide thresholds prevent flicker near the top.
    let scrollTicking = false;

    function handleScroll() {
        const y = window.scrollY;
        const mobile = window.innerWidth <= 991;
        if (y > (mobile ? 48 : 80)) {
            header.classList.add('scrolled');
        } else if (y < 20) {
            header.classList.remove('scrolled');
        }
        if (mobile) {
            document.documentElement.style.setProperty('--nav-offset', header.classList.contains('scrolled') ? '60px' : '100px');
        } else {
            document.documentElement.style.removeProperty('--nav-offset');
        }
        scrollTicking = false;
    }

    window.addEventListener('scroll', () => {
        if (!scrollTicking) {
            scrollTicking = true;
            requestAnimationFrame(handleScroll);
        }
    }, { passive: true });
    handleScroll(); // correct state if the page loads mid-scroll
    
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
            handleScroll();
            // Close mobile menu on resize to desktop
            if (window.innerWidth > 991) {
                setMobileMenu(false);
            }
        }, 250);
    });
    
    // ========================================
    // Close mobile menu when clicking outside
    // ========================================
    document.addEventListener('click', function(e) {
        if (!menuToggle.contains(e.target) && !mobileMenu.contains(e.target)) {
            if (mobileMenu.classList.contains('active')) {
                setMobileMenu(false);
            }
        }
    });
    
    // ========================================
    // Add animation on load
    // ========================================
    function animateOnLoad() {
        const heroContent = document.querySelector('.hero-content');
        if (heroContent) {
            // Keep the primary heading and booking actions visible immediately.
            heroContent.style.opacity = '1';
            heroContent.style.transform = 'none';
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
    
    // Each photo has its own heading, text and button (.hero-copy, same order)
    const heroCopies = document.querySelectorAll('[data-hero-copy]');

    function showSlide(index) {
        heroSlides.forEach(slide => slide.classList.remove('active'));
        if (heroSlides[index]) {
            lazyLoadSlide(heroSlides[index]);
            heroSlides[index].classList.add('active');
            preloadNextSlide(index);
        }
        heroCopies.forEach((copy, i) => {
            const active = i === index;
            copy.classList.toggle('is-active', active);
            copy.toggleAttribute('aria-hidden', !active);
            copy.querySelectorAll('a, button').forEach(el => {
                if (active) el.removeAttribute('tabindex'); else el.setAttribute('tabindex', '-1');
            });
        });
        currentSlide = index;
    }

    function nextSlide() {
        const next = (currentSlide + 1) % heroSlides.length;
        showSlide(next);
    }

    // Start slideshow - a new photo and message every 6 seconds.
    // Paused while the tab is hidden; stays on the first slide for reduced motion.
    const heroReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let heroTimer = null;
    const startHero = () => { if (!heroTimer) heroTimer = setInterval(nextSlide, 6000); };
    const stopHero = () => { clearInterval(heroTimer); heroTimer = null; };

    if (heroSlides.length > 1 && !heroReduceMotion) {
        // Preload second slide after a short delay
        setTimeout(() => preloadNextSlide(0), 1000);
        startHero();
        document.addEventListener('visibilitychange', () => (document.hidden ? stopHero() : startHero()));
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
    // Any element with data-count counts up from 0 when it scrolls into view.
    // Optional: data-suffix="+", data-prefix="", data-decimals="2".
    const counters = document.querySelectorAll('[data-count]');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function formatCount(value, decimals) {
        return value.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    function renderCount(el, value) {
        const decimals = parseInt(el.dataset.decimals || '0', 10);
        el.textContent = (el.dataset.prefix || '') + formatCount(value, decimals) + (el.dataset.suffix || '');
    }

    function animateCounter(el) {
        const target = parseFloat(el.dataset.count);
        const duration = target >= 1000 ? 2200 : 1800;
        let start = null;

        function tick(now) {
            if (start === null) start = now;
            const progress = Math.min(Math.max((now - start) / duration, 0), 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            renderCount(el, target * eased);
            if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    if (counters.length && 'IntersectionObserver' in window && !reduceMotion) {
        const counterObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounter(entry.target);
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.4 });

        counters.forEach(el => {
            renderCount(el, 0);
            counterObserver.observe(el);
        });
    }
    
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
    // Reviews wall (endless vertical scroll)
    // ========================================
    // Distributes the review cards into columns (2 on desktop, 1 on phones),
    // repeats them until each column is taller than the wall, then duplicates
    // the set so a CSS translateY(-50%) loop is seamless.
    const rvWall = document.querySelector('[data-rv-wall]');
    const rvReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (rvWall && !rvReduceMotion) {
        const rvCards = Array.from(rvWall.querySelectorAll('.rv-source .review-card'));
        let rvCols = 0;

        function buildReviewWall() {
            const cols = window.innerWidth <= 767 ? 1 : 2;
            if (cols === rvCols) return;
            rvCols = cols;

            rvWall.querySelectorAll('.rv-col').forEach(c => c.remove());
            rvWall.style.setProperty('--rv-cols', cols);
            rvWall.classList.add('is-live');
            const wallHeight = rvWall.clientHeight;

            for (let c = 0; c < cols; c++) {
                const mine = rvCards.filter((_, i) => i % cols === c);
                const col = document.createElement('div');
                col.className = 'rv-col';
                const track = document.createElement('div');
                track.className = 'rv-track';
                const group = document.createElement('div');
                group.className = 'rv-group';
                track.appendChild(group);
                col.appendChild(track);
                rvWall.appendChild(col);

                // Fill one group until it is at least as tall as the wall
                let pass = 0;
                do {
                    mine.forEach(card => {
                        const copy = card.cloneNode(true);
                        if (pass > 0) copy.setAttribute('aria-hidden', 'true');
                        group.appendChild(copy);
                    });
                    pass++;
                } while (group.offsetHeight < wallHeight && pass < 10);

                // Second identical group makes the loop seamless
                const twin = group.cloneNode(true);
                twin.setAttribute('aria-hidden', 'true');
                track.appendChild(twin);

                // Constant reading speed: ~22px/s, a little slower on the 2nd column
                const speed = c % 2 ? 18 : 22;
                track.style.setProperty('--rv-dur', (group.offsetHeight / speed).toFixed(1) + 's');
            }
        }

        buildReviewWall();
        let rvResize;
        window.addEventListener('resize', () => {
            clearTimeout(rvResize);
            rvResize = setTimeout(buildReviewWall, 200);
        });
    }


    // Keep the footer copyright year current
    document.querySelectorAll('[data-year]').forEach(el => {
        el.textContent = new Date().getFullYear();
    });

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
