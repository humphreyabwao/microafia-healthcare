// Book Wellness - Firebase Integration
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('wellness-form');
    const dateInput = document.getElementById('preferred-date');
    const packageCards = document.querySelectorAll('.package-card');
    const membersSelect = document.getElementById('members');

    // ==================== PACKAGE SELECTION FROM URL ====================
    const urlParams = new URLSearchParams(window.location.search);
    const packageParam = urlParams.get('package');
    if (packageParam) {
        const radio = Array.from(document.querySelectorAll('input[name="package"]')).find(input => input.value === packageParam);
        if (radio) {
            radio.checked = true;
            radio.closest('.package-card').classList.add('selected');
        }
    }

    // ==================== PACKAGE CARD VISUAL SELECTION ====================
    packageCards.forEach(card => {
        card.addEventListener('click', function() {
            packageCards.forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            
            // Update members for family package
            const pkg = this.dataset.package;
            if (pkg === 'family') {
                membersSelect.value = '4';
            } else {
                membersSelect.value = '1';
            }
        });
    });

    // ==================== DATE RESTRICTIONS ====================
    if (dateInput) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const maxDate = new Date(today);
        maxDate.setMonth(maxDate.getMonth() + 3);

        dateInput.min = tomorrow.toISOString().split('T')[0];
        dateInput.max = maxDate.toISOString().split('T')[0];

    }

    // ==================== FORM SUBMISSION ====================
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();

            // Validate package selection
            const selectedPackage = document.querySelector('input[name="package"]:checked');
            if (!selectedPackage) {
                alert('Please select a wellness package.');
                return;
            }

            const submitBtn = form.querySelector('.btn-submit');
            const originalText = submitBtn.innerHTML;

            // Show loading
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            submitBtn.disabled = true;

            // Package details
            const packages = {
                'women': { name: "Women's Wellness Package", price: 10000 },
                'men': { name: "Men's Wellness Package", price: 12000 },
                'family': { name: "Family Wellness Package", price: 15000 }
            };

            const pkg = packages[selectedPackage.value];

            // Collect form data
            const data = {
                package: selectedPackage.value,
                packageName: pkg.name,
                packagePrice: pkg.price,
                fullName: document.getElementById('full-name').value.trim(),
                phone: document.getElementById('phone').value.trim(),
                email: document.getElementById('email').value.trim(),
                members: document.getElementById('members').value,
                preferredDate: document.getElementById('preferred-date').value,
                preferredTime: document.getElementById('preferred-time').value,
                preferredTimeSlot: document.getElementById('preferred-time').options[document.getElementById('preferred-time').selectedIndex].text,
                notes: document.getElementById('notes').value.trim() || 'None'
            };

            try {
                // Save to Firebase Firestore
                const docRef = await db.collection('wellness_bookings').add({
                    ...data,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'pending'
                });

                console.log('Wellness booking saved:', docRef.id);
                showMessage('success', 'Booking Received!', `Your ${pkg.name} booking has been received. We will contact you shortly to confirm.`);
                form.reset();
                packageCards.forEach(c => c.classList.remove('selected'));

            } catch (error) {
                console.error('Error:', error);
                showMessage('error', 'Submission Failed', 'Please try again or call us at +254 740 250 696');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }
});

// ==================== MESSAGE POPUP ====================
function showMessage(type, title, message) {
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
        <button onclick="closeMessage()" style="background:${color};color:#fff;border:none;padding:12px 30px;cursor:pointer;font-size:1rem;">OK</button>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(popup);
}

function closeMessage() {
    document.getElementById('messageOverlay')?.remove();
    document.getElementById('messagePopup')?.remove();
}
