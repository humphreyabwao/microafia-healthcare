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
    let pendingFile = null;
    let uploadTask = null;
    let uploadVersion = 0;
    let isUploading = false;
    let isSubmitting = false;
    const uploadBox = document.querySelector('.upload-box');
    const uploadStatus = document.getElementById('labUploadStatus');

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
            orderTotal.textContent = uploadedFile ? 'To be confirmed' : 'KSh 0';
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
        btnOrder.disabled = isUploading || isSubmitting || Boolean(pendingFile) ||
            (selectedTests.length === 0 && !uploadedFile);
        uploadBox.setAttribute('aria-disabled', String(isUploading || isSubmitting));
        labRequestFile.disabled = isUploading || isSubmitting;
    }

    // ==================== FILE UPLOAD ====================
    function renderUploadStatus(message, { error = false, action, label, removable = false } = {}) {
        uploadStatus.hidden = false;
        uploadStatus.classList.toggle('is-error', error);
        uploadStatus.replaceChildren();
        const text = document.createElement('span');
        text.className = 'upload-status-text';
        text.textContent = message;
        uploadStatus.appendChild(text);
        if (action) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'upload-action';
            button.textContent = label;
            button.addEventListener('click', action);
            uploadStatus.appendChild(button);
        }
        if (removable) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'upload-action';
            remove.textContent = 'Remove';
            remove.addEventListener('click', clearUpload);
            uploadStatus.appendChild(remove);
        }
    }

    async function deleteUpload(file) {
        if (!file?.path) return;
        try { await patientUploads.storage.ref(file.path).delete(); }
        catch (error) { console.warn('Could not remove unused lab request:', error.code); }
    }

    function clearUpload() {
        if (isSubmitting || document.getElementById('orderForm')) return;
        uploadVersion++;
        uploadTask?.cancel();
        uploadTask = null;
        isUploading = false;
        const previous = uploadedFile;
        uploadedFile = null;
        pendingFile = null;
        labRequestFile.value = '';
        uploadStatus.hidden = true;
        uploadStatus.replaceChildren();
        updateOrderSummary();
        void deleteUpload(previous);
    }

    async function uploadFile(file) {
        if (!file || isUploading || isSubmitting || document.getElementById('orderForm')) return;
        const types = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
        const extension = file.name.split('.').pop().toLowerCase();
        const contentType = types[extension];
        if (!contentType || (file.type && file.type !== contentType) || !file.size || file.size > 5 * 1024 * 1024) {
            labRequestFile.value = '';
            renderUploadStatus('Choose a non-empty PDF, JPG or PNG file no larger than 5 MB.' +
                (uploadedFile ? ' Your previous file is still attached.' : ''), { error: true, removable: true });
            return;
        }

        const version = ++uploadVersion;
        const previous = uploadedFile;
        pendingFile = file;
        isUploading = true;
        updateOrderSummary();
        renderUploadStatus(`Uploading ${file.name} ? 0%`, { action: clearUpload, label: 'Cancel' });
        let completedFile = null;
        try {
            const user = await patientUploads.ensureUser();
            if (version !== uploadVersion) return;
            const uploadStorage = patientUploads.storage;
            uploadStorage.setMaxUploadRetryTime(30000);
            const path = `prescriptions/lab/${user.uid}/${crypto.randomUUID()}.${extension}`;
            uploadTask = uploadStorage.ref(path).put(file, {
                contentType, customMetadata: { ownerUid: user.uid, purpose: 'lab' }
            });
            uploadTask.on('state_changed', snapshot => {
                if (version !== uploadVersion) return;
                const progress = Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100);
                uploadStatus.querySelector('span').textContent = `Uploading ${file.name} ? ${progress}%`;
            });
            const snapshot = await uploadTask;
            completedFile = { path };
            const url = await snapshot.ref.getDownloadURL();
            if (version !== uploadVersion) {
                await deleteUpload(completedFile);
                return;
            }
            uploadedFile = { name: file.name, url, path, ownerUid: user.uid };
            pendingFile = null;
            renderUploadStatus(`${file.name} attached. Place your order to send it to our team.`, { removable: true });
            void deleteUpload(previous);
        } catch (error) {
            await deleteUpload(completedFile);
            if (version !== uploadVersion) return;
            uploadedFile = previous;
            console.error('Lab request upload failed:', error.code || error.message);
            const message = error.code === 'storage/unauthorized' || error.code === 'storage/unauthenticated'
                ? 'The upload service could not accept this file. Please retry or call +254 740 250 696 for help.'
                : 'Upload failed. Check your connection and try again, or call +254 740 250 696.';
            renderUploadStatus(message, { error: true, action: () => uploadFile(file), label: 'Retry', removable: true });
        } finally {
            if (version === uploadVersion) {
                uploadTask = null;
                isUploading = false;
                labRequestFile.value = '';
                updateOrderSummary();
            }
        }
    }

    labRequestFile.addEventListener('change', function() { void uploadFile(this.files[0]); });
    uploadBox.addEventListener('click', event => {
        if (isUploading || isSubmitting || document.getElementById('orderForm')) event.preventDefault();
    });
    uploadBox.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!isUploading && !isSubmitting && !document.getElementById('orderForm')) labRequestFile.click();
        }
    });
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(name => {
        uploadBox.addEventListener(name, event => {
            event.preventDefault();
            event.stopPropagation();
            uploadBox.classList.toggle('is-dragover', name === 'dragenter' || name === 'dragover');
            if (name === 'drop') {
                const files = event.dataTransfer?.files;
                if (files?.length === 1) void uploadFile(files[0]);
                else if (!isUploading && !isSubmitting && !document.getElementById('orderForm')) {
                    renderUploadStatus('Please upload one lab request at a time.', { error: true, removable: true });
                }
            }
        });
    });

    // ==================== PLACE ORDER ====================
    btnOrder.addEventListener('click', function() {
        if (!btnOrder.disabled) showOrderModal();
    });

    function showOrderModal() {
        if (document.getElementById('orderForm')) return;
        const total = selectedTests.reduce((sum, t) => sum + t.price, 0);
        const prescription = uploadedFile ? { ...uploadedFile } : null;
        const totalLabel = selectedTests.length ? `KSh ${total.toLocaleString()}` : 'To be confirmed';
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
                            <div class="order-tests-list">${testsHtml || '<p>Tests will be confirmed from your lab request.</p>'}</div>
                            <div class="modal-total"><span>${selectedTests.length ? 'Selected tests:' : 'Total:'}</span><span>${totalLabel}</span></div>
                            ${prescription ? '<p class="order-prescription"></p><p>Any additional tests on your request will be priced by our team.</p>' : ''}
                        </div>
                        <button type="submit" class="btn-submit-order">
                            Submit Order
                        </button>
                    </form>
                </div>
            </div>
        `;

        if (prescription) modal.querySelector('.order-prescription').textContent = `Lab request: ${prescription.name}`;
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        setTimeout(() => modal.classList.add('active'), 10);

        // Close handlers
        const closeModal = () => {
            if (isSubmitting) return;
            modal.classList.remove('active');
            setTimeout(() => { modal.remove(); document.body.style.overflow = ''; }, 300);
        };
        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

        // Form submission
        modal.querySelector('#orderForm').addEventListener('submit', async function(e) {
            e.preventDefault();

            if (isSubmitting || isUploading || pendingFile) return;
            isSubmitting = true;
            updateOrderSummary();
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
                pricingStatus: prescription ? 'requires_review' : 'confirmed',
                prescription
            };

            try {
                // Save to Firebase Firestore
                const docRef = await db.collection('lab_orders').add({
                    ...orderData,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'pending'
                });

                console.log('Lab order saved:', docRef.id);
                isSubmitting = false;
                closeModal();
                showMessage('success', 'Order Received!', 'Your lab test order has been received. We will contact you shortly.');
                
                // Reset
                selectedTests.forEach(t => t.el.checked = false);
                selectedTests = [];
                uploadedFile = null;
                labRequestFile.value = '';
                pendingFile = null;
                uploadStatus.hidden = true;
                uploadStatus.replaceChildren();
                updateOrderSummary();

            } catch (error) {
                isSubmitting = false;
                updateOrderSummary();
                console.error('Error:', error);
                showMessage('error', 'Submission Failed', 'Please try again or call us at +254 740 250 696');
                submitBtn.innerHTML = 'Submit Order';
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
