// DNA Services Page - JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const dnaTestSelect = document.getElementById('dnaTest');
    const selectedTestDisplay = document.getElementById('selectedTestDisplay');
    const selectedTestName = document.getElementById('selectedTestName');
    const selectedTestPrice = document.getElementById('selectedTestPrice');
    const dnaOrderForm = document.getElementById('dnaOrderForm');
    const orderNowButtons = document.querySelectorAll('.btn-order-now');

    // Handle "Order Now" button clicks from cards
    orderNowButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const testName = this.dataset.test;
            const testPrice = this.dataset.price;
            
            // Find and select the matching option in the dropdown
            const options = dnaTestSelect.options;
            for (let i = 0; i < options.length; i++) {
                if (options[i].value.includes(testName)) {
                    dnaTestSelect.selectedIndex = i;
                    break;
                }
            }
            
            // Update display
            updateSelectedTestDisplay(testName, testPrice);
            
            // Smooth scroll to order section
            const orderSection = document.getElementById('order-section');
            orderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    // Handle dropdown change
    dnaTestSelect.addEventListener('change', function() {
        const value = this.value;
        if (value) {
            const [testName, testPrice] = value.split('|');
            updateSelectedTestDisplay(testName, testPrice);
        } else {
            selectedTestDisplay.style.display = 'none';
        }
    });

    // Update selected test display
    function updateSelectedTestDisplay(testName, testPrice) {
        selectedTestName.textContent = testName;
        selectedTestPrice.textContent = `KSh ${parseInt(testPrice).toLocaleString()}`;
        selectedTestDisplay.style.display = 'flex';
    }

    // Form submission
    dnaOrderForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const submitBtn = this.querySelector('.btn-submit');
        const originalText = submitBtn.innerHTML;
        
        // Show loading state
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        submitBtn.disabled = true;

        // Get form data
        const formData = new FormData(this);
        const testValue = formData.get('dnaTest');
        
        if (!testValue) {
            showMessage('error', 'Please Select a Test', 'Choose a DNA test type from the dropdown.');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            return;
        }

        const [testName, testPrice] = testValue.split('|');

        const orderData = {
            customerName: formData.get('fullName'),
            phone: formData.get('phone'),
            email: formData.get('email') || 'Not provided',
            notes: formData.get('notes') || 'None',
            tests: [{ name: testName, price: parseInt(testPrice) }],
            total: parseInt(testPrice),
            collectionMethod: formData.get('collectionMethod'),
            location: formData.get('location'),
            consent: formData.get('consent') === 'on',
            prescription: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'pending',
            category: 'dna'
        };

        try {
            // Save to Firebase Firestore - same collection as lab orders
            const docRef = await db.collection('lab_orders').add(orderData);
            console.log('DNA order saved:', docRef.id);

            // Show success message
            showMessage('success', 'Order Received!', 
                `Your ${testName} order has been received. We will contact you shortly to schedule sample collection.`);

            // Reset form
            dnaOrderForm.reset();
            selectedTestDisplay.style.display = 'none';

        } catch (error) {
            console.error('Error submitting order:', error);
            showMessage('error', 'Submission Failed', 
                'There was an error submitting your order. Please try again or call us at +254 740 250 696');
        }

        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    });

    // Show message popup
    function showMessage(type, title, message) {
        const isSuccess = type === 'success';
        const color = isSuccess ? '#064e3b' : '#dc3545';
        const icon = isSuccess ? 'fa-check-circle' : 'fa-exclamation-circle';

        // Remove existing popups
        document.getElementById('messageOverlay')?.remove();
        document.getElementById('messagePopup')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'messageOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;';

        const popup = document.createElement('div');
        popup.id = 'messagePopup';
        popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:40px;text-align:center;z-index:10000;max-width:400px;width:90%;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.2);';
        popup.innerHTML = `
            <i class="fas ${icon}" style="font-size:60px;color:${color};margin-bottom:20px;display:block;"></i>
            <h3 style="margin:0 0 15px;color:${color};">${title}</h3>
            <p style="color:#666;margin:0 0 25px;line-height:1.6;">${message}</p>
            <button onclick="closeMessage()" style="background:${color};color:#fff;border:none;padding:12px 35px;cursor:pointer;font-size:1rem;border-radius:8px;font-weight:600;">OK</button>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(popup);

        // Close on overlay click
        overlay.addEventListener('click', closeMessage);
    }

    // Check for URL parameters (e.g., from lab services page)
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedTest = urlParams.get('test');
    if (preselectedTest) {
        const options = dnaTestSelect.options;
        for (let i = 0; i < options.length; i++) {
            if (options[i].value.toLowerCase().includes(preselectedTest.toLowerCase())) {
                dnaTestSelect.selectedIndex = i;
                dnaTestSelect.dispatchEvent(new Event('change'));
                break;
            }
        }
    }
});

// Global function to close message popup
function closeMessage() {
    document.getElementById('messageOverlay')?.remove();
    document.getElementById('messagePopup')?.remove();
}
