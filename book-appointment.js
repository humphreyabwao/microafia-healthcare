// Book Appointment - Firebase Integration
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('appointmentForm');
    const dateInput = document.getElementById('preferredDate');
    
    // Set date restrictions (tomorrow to 3 months ahead, no Sundays)
    if (dateInput) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const maxDate = new Date(today);
        maxDate.setMonth(maxDate.getMonth() + 3);
        
        dateInput.min = tomorrow.toISOString().split('T')[0];
        dateInput.max = maxDate.toISOString().split('T')[0];
        
        dateInput.addEventListener('change', function() {
            if (new Date(this.value).getDay() === 0) {
                alert('We are closed on Sundays. Please select another day.');
                this.value = '';
            }
        });
    }

    // Form submission
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = form.querySelector('.btn-submit');
            const originalText = submitBtn.innerHTML;
            
            // Show loading
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            submitBtn.disabled = true;

            // Collect form data
            const data = {
                firstName: document.getElementById('firstName').value.trim(),
                lastName: document.getElementById('lastName').value.trim(),
                phone: document.getElementById('phone').value.trim(),
                email: document.getElementById('email').value.trim() || 'Not provided',
                dob: document.getElementById('dob').value || 'Not provided',
                gender: document.getElementById('gender').value || 'Not specified',
                service: document.getElementById('service').value,
                serviceName: document.getElementById('service').options[document.getElementById('service').selectedIndex].text,
                preferredDate: document.getElementById('preferredDate').value,
                preferredTime: document.getElementById('preferredTime').value,
                symptoms: document.getElementById('symptoms').value.trim() || 'None',
                isNewPatient: document.getElementById('isNewPatient').checked
            };

            try {
                // Save to Firebase Firestore
                const docRef = await db.collection('appointments').add({
                    ...data,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'pending'
                });

                console.log('Appointment saved:', docRef.id);
                showMessage('success', 'Appointment Booked!', 'Your appointment has been received. We will contact you shortly to confirm.');
                form.reset();

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

// Show success/error message popup
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
