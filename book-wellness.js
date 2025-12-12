// Book Wellness Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    initPackageSelection();
    initDateRestrictions();
    initFormValidation();
    initWhatsAppSubmission();
    initMobileNav();
});

// Initialize package selection from URL
function initPackageSelection() {
    const urlParams = new URLSearchParams(window.location.search);
    const packageParam = urlParams.get('package');
    
    if (packageParam) {
        const packageRadio = document.querySelector(`input[name="package"][value="${packageParam}"]`);
        if (packageRadio) {
            packageRadio.checked = true;
        }
    }

    // Update members field based on package selection
    const packageRadios = document.querySelectorAll('input[name="package"]');
    const membersSelect = document.getElementById('members');

    packageRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'family') {
                membersSelect.value = '4';
            } else {
                membersSelect.value = '1';
            }
        });
    });
}

// Initialize date input restrictions
function initDateRestrictions() {
    const dateInput = document.getElementById('preferred-date');
    if (!dateInput) return;

    // Set minimum date to tomorrow
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const minDate = tomorrow.toISOString().split('T')[0];
    dateInput.setAttribute('min', minDate);

    // Set maximum date to 3 months from now
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 3);
    dateInput.setAttribute('max', maxDate.toISOString().split('T')[0]);

    // Disable Sundays
    dateInput.addEventListener('input', function() {
        const selectedDate = new Date(this.value);
        if (selectedDate.getDay() === 0) {
            alert('We are closed on Sundays. Please select another day.');
            this.value = '';
        }
    });
}

// Form validation
function initFormValidation() {
    const form = document.getElementById('wellness-form');
    if (!form) return;

    const requiredFields = form.querySelectorAll('[required]');

    requiredFields.forEach(field => {
        field.addEventListener('blur', function() {
            validateField(this);
        });

        field.addEventListener('input', function() {
            if (this.classList.contains('invalid')) {
                validateField(this);
            }
        });
    });
}

function validateField(field) {
    const value = field.value ? field.value.trim() : '';
    let isValid = true;
    let errorMessage = '';

    // Skip radio buttons individual validation
    if (field.type === 'radio') {
        return true;
    }

    // Check if empty
    if (!value && field.required) {
        isValid = false;
        errorMessage = 'This field is required';
    }

    // Email validation
    if (field.type === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid email address';
        }
    }

    // Phone validation
    if (field.type === 'tel' && value) {
        const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
        if (!phoneRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid phone number';
        }
    }

    // Update field styling
    if (isValid) {
        field.classList.remove('invalid');
        field.style.borderColor = '#e0e0e0';
        removeError(field);
    } else {
        field.classList.add('invalid');
        field.style.borderColor = '#dc3545';
        showError(field, errorMessage);
    }

    return isValid;
}

function showError(field, message) {
    removeError(field);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.style.cssText = 'color: #dc3545; font-size: 0.85rem; margin-top: 5px;';
    errorDiv.textContent = message;
    field.parentNode.appendChild(errorDiv);
}

function removeError(field) {
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
}

// WhatsApp submission
function initWhatsAppSubmission() {
    const form = document.getElementById('wellness-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
        e.preventDefault();

        // Check package selection
        const selectedPackage = document.querySelector('input[name="package"]:checked');
        if (!selectedPackage) {
            alert('Please select a wellness package.');
            return;
        }

        // Validate all required fields
        const requiredFields = form.querySelectorAll('input:not([type="radio"]):not([type="checkbox"])[required], select[required], textarea[required]');
        let isFormValid = true;

        requiredFields.forEach(field => {
            if (!validateField(field)) {
                isFormValid = false;
            }
        });

        if (!isFormValid) {
            alert('Please fill in all required fields correctly.');
            return;
        }

        // Check terms agreement
        const termsCheckbox = document.getElementById('terms');
        if (termsCheckbox && !termsCheckbox.checked) {
            alert('Please agree to the terms and conditions.');
            return;
        }

        // Get package details
        const packageNames = {
            'women': "Women's Wellness Package - KSh 10,000",
            'men': "Men's Wellness Package - KSh 12,000",
            'family': "Family Wellness Package - KSh 15,000"
        };

        // Gather form data
        const formData = {
            package: selectedPackage.value,
            packageName: packageNames[selectedPackage.value],
            fullName: document.getElementById('full-name').value,
            phone: document.getElementById('phone').value,
            email: document.getElementById('email').value,
            members: document.getElementById('members').value,
            date: document.getElementById('preferred-date').value,
            time: document.getElementById('preferred-time').value,
            timeName: document.getElementById('preferred-time').options[document.getElementById('preferred-time').selectedIndex].text,
            notes: document.getElementById('notes').value || 'None'
        };

        // Format date
        const appointmentDate = new Date(formData.date);
        const formattedDate = appointmentDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Create WhatsApp message
        const message = `
*🏥 WELLNESS PACKAGE BOOKING*
━━━━━━━━━━━━━━━━━━━━

*Package Selected*
📦 ${formData.packageName}
👥 Members: ${formData.members}

*Patient Information*
👤 Name: ${formData.fullName}
📞 Phone: ${formData.phone}
📧 Email: ${formData.email}

*Preferred Schedule*
📅 Date: ${formattedDate}
⏰ Time: ${formData.timeName}

*Additional Notes*
📝 ${formData.notes}

━━━━━━━━━━━━━━━━━━━━
_Sent from Microafia Healthcare Website_
        `.trim();

        // Encode and open WhatsApp
        const encodedMessage = encodeURIComponent(message);
        const whatsappURL = `https://wa.me/254700000000?text=${encodedMessage}`; // Replace with actual number

        // Show confirmation
        if (confirm('Your wellness package booking will be sent via WhatsApp. Continue?')) {
            window.open(whatsappURL, '_blank');
            
            // Show success message
            showSuccessMessage();
            
            // Reset form
            form.reset();
        }
    });
}

function showSuccessMessage() {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #fff;
        padding: 40px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        text-align: center;
        z-index: 10000;
        max-width: 400px;
    `;
    successDiv.innerHTML = `
        <i class="fas fa-check-circle" style="font-size: 60px; color: #064e3b; margin-bottom: 20px;"></i>
        <h3 style="margin: 0 0 15px; color: #064e3b;">Booking Sent!</h3>
        <p style="color: #666; margin: 0 0 20px;">Your wellness package booking has been sent. We'll confirm your appointment shortly.</p>
        <button onclick="this.parentElement.remove(); document.querySelector('.overlay-bg').remove();" 
                style="background: #064e3b; color: #fff; border: none; padding: 12px 30px; cursor: pointer; font-size: 1rem;">
            OK
        </button>
    `;

    // Add overlay
    const overlay = document.createElement('div');
    overlay.className = 'overlay-bg';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 9999;
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(successDiv);
}

// Mobile Navigation
function initMobileNav() {
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const menuToggle = document.querySelector('.menu-toggle');
    
    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', function() {
            hamburger.classList.toggle('active');
            mobileMenu.classList.toggle('active');
            document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
        });
    }

    // Mobile dropdown toggle
    const dropdownToggles = document.querySelectorAll('.mobile-dropdown-toggle');
    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            const parent = this.closest('.mobile-has-dropdown');
            parent.classList.toggle('active');
        });
    });

    // Close menu on link click
    const navLinks = document.querySelectorAll('.mobile-menu a:not(.mobile-dropdown-toggle)');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (hamburger) hamburger.classList.remove('active');
            if (mobileMenu) mobileMenu.classList.remove('active');
            document.body.style.overflow = '';
        });
    });
}

// Sticky header
window.addEventListener('scroll', function() {
    const header = document.querySelector('.header');
    if (header) {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }
});
