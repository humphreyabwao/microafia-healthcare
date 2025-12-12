// Lab Services - Firebase Integration with Storage
document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const searchInput = document.getElementById('labSearch');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const checkboxes = document.querySelectorAll('.test-checkbox');
    const selectedTestsContainer = document.getElementById('selectedTests');
    const orderTotal = document.getElementById('orderTotal');
    const btnOrder = document.getElementById('btnOrder');
    const labRequestFile = document.getElementById('labRequestFile');
    const categories = document.querySelectorAll('.lab-category');
    const tableRows = document.querySelectorAll('.table-row');

    // State
    let selectedTests = [];
    let uploadedFile = null;

    // ==================== SEARCH ====================
    searchInput.addEventListener('input', function() {
        const query = this.value.toLowerCase().trim();
        tableRows.forEach(row => {
            const testName = row.querySelector('.col-test')?.textContent.toLowerCase() || '';
            row.style.display = testName.includes(query) ? '' : 'none';
        });
        // Hide empty categories
        categories.forEach(cat => {
            const visible = cat.querySelectorAll('.table-row:not([style*="display: none"])');
            cat.style.display = visible.length > 0 ? '' : 'none';
        });
    });

    // ==================== FILTER ====================
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const filter = this.dataset.filter;
            categories.forEach(cat => {
                cat.style.display = (filter === 'all' || cat.dataset.category === filter) ? '' : 'none';
            });
            searchInput.value = '';
            tableRows.forEach(row => row.style.display = '');
        });
    });

    // ==================== TEST SELECTION ====================
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const test = { name: this.dataset.test, price: parseInt(this.dataset.price), el: this };
            if (this.checked) {
                selectedTests.push(test);
            } else {
                selectedTests = selectedTests.filter(t => t.name !== test.name);
            }
            updateOrderSummary();
        });
    });

    function updateOrderSummary() {
        if (selectedTests.length === 0) {
            selectedTestsContainer.innerHTML = '<p class="empty-cart">No tests selected</p>';
            orderTotal.textContent = 'KSh 0';
            btnOrder.disabled = true;
        } else {
            let html = '';
            let total = 0;
            selectedTests.forEach(test => {
                total += test.price;
                html += `
                    <div class="selected-test-item">
                        <span>${test.name}</span>
                        <span>KSh ${test.price.toLocaleString()}</span>
                        <button class="remove-test" data-test="${test.name}"><i class="fas fa-times"></i></button>
                    </div>`;
            });
            selectedTestsContainer.innerHTML = html;
            orderTotal.textContent = `KSh ${total.toLocaleString()}`;
            btnOrder.disabled = false;

            // Remove button handlers
            document.querySelectorAll('.remove-test').forEach(btn => {
                btn.addEventListener('click', function() {
                    const name = this.dataset.test;
                    const test = selectedTests.find(t => t.name === name);
                    if (test) {
                        test.el.checked = false;
                        selectedTests = selectedTests.filter(t => t.name !== name);
                        updateOrderSummary();
                    }
                });
            });
        }
    }

    // ==================== FILE UPLOAD ====================
    labRequestFile.addEventListener('change', async function() {
        const file = this.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('File size must be less than 5MB');
            this.value = '';
            return;
        }

        const uploadBox = this.closest('.upload-section');
        
        // Remove existing preview
        uploadBox.querySelector('.file-preview')?.remove();

        // Show uploading state
        const preview = document.createElement('div');
        preview.className = 'file-preview';
        preview.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Uploading ${file.name}...</span>`;
        uploadBox.appendChild(preview);

        try {
            // Upload to Firebase Storage
            const fileName = `prescriptions/${Date.now()}_${file.name}`;
            const storageRef = storage.ref(fileName);
            const snapshot = await storageRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();

            uploadedFile = { name: file.name, url: downloadURL, path: fileName };

            // Update preview
            preview.innerHTML = `
                <i class="fas fa-check-circle" style="color:#064e3b"></i>
                <span>${file.name}</span>
                <button class="remove-file" type="button"><i class="fas fa-times"></i></button>
            `;

            preview.querySelector('.remove-file').addEventListener('click', async function() {
                try {
                    await storage.ref(uploadedFile.path).delete();
                } catch (e) { console.log('File already deleted'); }
                labRequestFile.value = '';
                uploadedFile = null;
                preview.remove();
            });

            console.log('File uploaded:', downloadURL);

        } catch (error) {
            console.error('Upload error:', error);
            preview.innerHTML = `<i class="fas fa-exclamation-circle" style="color:#dc3545"></i><span>Upload failed. Try again.</span>`;
            uploadedFile = null;
        }
    });

    // ==================== PLACE ORDER ====================
    btnOrder.addEventListener('click', function() {
        showOrderModal();
    });

    function showOrderModal() {
        const total = selectedTests.reduce((sum, t) => sum + t.price, 0);
        let testsHtml = selectedTests.map(t => 
            `<div><span>${t.name}</span><span>KSh ${t.price.toLocaleString()}</span></div>`
        ).join('');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-clipboard-list"></i> Complete Your Order</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="orderForm">
                        <div class="form-group">
                            <label>Full Name *</label>
                            <input type="text" name="fullName" required placeholder="Enter your full name">
                        </div>
                        <div class="form-group">
                            <label>Phone Number *</label>
                            <input type="tel" name="phone" required placeholder="e.g., 0712345678">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" name="email" placeholder="your@email.com">
                        </div>
                        <div class="form-group">
                            <label>Additional Notes</label>
                            <textarea name="notes" placeholder="Any special instructions..."></textarea>
                        </div>
                        <div class="order-summary-modal">
                            <h4>Order Summary</h4>
                            <div class="order-tests-list">${testsHtml}</div>
                            <div class="modal-total"><span>Total:</span><span>KSh ${total.toLocaleString()}</span></div>
                            ${uploadedFile ? `<p style="color:#064e3b;margin-top:10px;"><i class="fas fa-paperclip"></i> Prescription: ${uploadedFile.name}</p>` : ''}
                        </div>
                        <button type="submit" class="btn-submit-order">
                            <i class="fas fa-paper-plane"></i> Submit Order
                        </button>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        setTimeout(() => modal.classList.add('active'), 10);

        // Close handlers
        const closeModal = () => {
            modal.classList.remove('active');
            setTimeout(() => { modal.remove(); document.body.style.overflow = ''; }, 300);
        };
        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

        // Form submission
        modal.querySelector('#orderForm').addEventListener('submit', async function(e) {
            e.preventDefault();

            const submitBtn = this.querySelector('.btn-submit-order');
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            submitBtn.disabled = true;

            const formData = new FormData(this);
            const orderData = {
                customerName: formData.get('fullName'),
                phone: formData.get('phone'),
                email: formData.get('email') || 'Not provided',
                notes: formData.get('notes') || 'None',
                tests: selectedTests.map(t => ({ name: t.name, price: t.price })),
                total: total,
                prescription: uploadedFile ? { name: uploadedFile.name, url: uploadedFile.url } : null
            };

            try {
                // Save to Firebase Firestore
                const docRef = await db.collection('lab_orders').add({
                    ...orderData,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'pending'
                });

                console.log('Lab order saved:', docRef.id);
                closeModal();
                showMessage('success', 'Order Received!', 'Your lab test order has been received. We will contact you shortly.');
                
                // Reset
                selectedTests.forEach(t => t.el.checked = false);
                selectedTests = [];
                uploadedFile = null;
                labRequestFile.value = '';
                document.querySelector('.file-preview')?.remove();
                updateOrderSummary();

            } catch (error) {
                console.error('Error:', error);
                showMessage('error', 'Submission Failed', 'Please try again or call us at +254 740 250 696');
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Order';
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
