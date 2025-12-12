// Lab Services Page JavaScript

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

    // Search functionality
    searchInput.addEventListener('input', function() {
        const query = this.value.toLowerCase().trim();
        
        tableRows.forEach(row => {
            const testName = row.querySelector('.col-test')?.textContent.toLowerCase() || '';
            const isMatch = testName.includes(query);
            row.style.display = isMatch ? '' : 'none';
        });

        // Hide empty categories
        categories.forEach(category => {
            const visibleRows = category.querySelectorAll('.table-row:not([style*="display: none"])');
            category.style.display = visibleRows.length > 0 ? '' : 'none';
        });
    });

    // Filter functionality
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const filter = this.dataset.filter;

            categories.forEach(category => {
                if (filter === 'all' || category.dataset.category === filter) {
                    category.style.display = '';
                } else {
                    category.style.display = 'none';
                }
            });

            // Reset search
            searchInput.value = '';
            tableRows.forEach(row => row.style.display = '');
        });
    });

    // Checkbox functionality
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const testName = this.dataset.test;
            const price = parseInt(this.dataset.price);

            if (this.checked) {
                selectedTests.push({ name: testName, price: price, checkbox: this });
            } else {
                selectedTests = selectedTests.filter(t => t.name !== testName);
            }

            updateOrderSummary();
        });
    });

    // Update order summary
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
                        <span class="test-name">${test.name}</span>
                        <span class="test-price">KSh ${test.price.toLocaleString()}</span>
                        <button class="remove-test" data-test="${test.name}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            });

            selectedTestsContainer.innerHTML = html;
            orderTotal.textContent = `KSh ${total.toLocaleString()}`;
            btnOrder.disabled = false;

            // Add remove functionality
            document.querySelectorAll('.remove-test').forEach(btn => {
                btn.addEventListener('click', function() {
                    const testName = this.dataset.test;
                    const test = selectedTests.find(t => t.name === testName);
                    if (test) {
                        test.checkbox.checked = false;
                        selectedTests = selectedTests.filter(t => t.name !== testName);
                        updateOrderSummary();
                    }
                });
            });
        }
    }

    // File upload
    labRequestFile.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                alert('File size must be less than 5MB');
                this.value = '';
                return;
            }

            uploadedFile = file;
            const uploadBox = this.closest('.upload-section');
            
            // Remove existing preview
            const existingPreview = uploadBox.querySelector('.file-preview');
            if (existingPreview) {
                existingPreview.remove();
            }

            // Add preview
            const preview = document.createElement('div');
            preview.className = 'file-preview';
            preview.innerHTML = `
                <i class="fas fa-file-alt"></i>
                <span>${file.name}</span>
                <button class="remove-file" type="button">
                    <i class="fas fa-times"></i>
                </button>
            `;
            uploadBox.appendChild(preview);

            preview.querySelector('.remove-file').addEventListener('click', function() {
                labRequestFile.value = '';
                uploadedFile = null;
                preview.remove();
            });
        }
    });

    // Order button click - show modal
    btnOrder.addEventListener('click', function() {
        showOrderModal();
    });

    // Show order modal
    function showOrderModal() {
        let testsHtml = '';
        let total = 0;

        selectedTests.forEach(test => {
            total += test.price;
            testsHtml += `<div><span>${test.name}</span><span>KSh ${test.price.toLocaleString()}</span></div>`;
        });

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
                            <textarea name="notes" placeholder="Any special instructions or requests..."></textarea>
                        </div>

                        <div class="order-summary-modal">
                            <h4>Order Summary</h4>
                            <div class="order-tests-list">
                                ${testsHtml}
                            </div>
                            <div class="modal-total">
                                <span>Total:</span>
                                <span>KSh ${total.toLocaleString()}</span>
                            </div>
                        </div>

                        <button type="submit" class="btn-submit-order">
                            <i class="fas fa-whatsapp"></i> Send Order via WhatsApp
                        </button>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        // Animate in
        setTimeout(() => modal.classList.add('active'), 10);

        // Close modal
        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeModal();
        });

        function closeModal() {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
                document.body.style.overflow = '';
            }, 300);
        }

        // Form submission
        modal.querySelector('#orderForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const name = formData.get('fullName');
            const phone = formData.get('phone');
            const email = formData.get('email') || 'Not provided';
            const notes = formData.get('notes') || 'None';

            // Create WhatsApp message
            let message = `🏥 *NEW LAB TEST ORDER*\n\n`;
            message += `👤 *Name:* ${name}\n`;
            message += `📱 *Phone:* ${phone}\n`;
            message += `📧 *Email:* ${email}\n\n`;
            message += `🧪 *Tests Ordered:*\n`;

            selectedTests.forEach(test => {
                message += `• ${test.name} - KSh ${test.price.toLocaleString()}\n`;
            });

            message += `\n💰 *Total:* KSh ${total.toLocaleString()}\n`;

            if (uploadedFile) {
                message += `\n📎 *Lab Request Form:* Attached (${uploadedFile.name})\n`;
            }

            if (notes !== 'None') {
                message += `\n📝 *Notes:* ${notes}\n`;
            }

            // WhatsApp link
            const whatsappNumber = '254740250696';
            const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

            window.open(whatsappUrl, '_blank');

            // Close modal and reset
            closeModal();
            
            // Show success message
            showSuccessMessage();
        });
    }

    // Success message
    function showSuccessMessage() {
        const successDiv = document.createElement('div');
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 20px 30px;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
            z-index: 2000;
            animation: slideIn 0.3s ease;
        `;
        successDiv.innerHTML = `
            <i class="fas fa-check-circle"></i> 
            Order sent! We'll contact you shortly.
        `;
        document.body.appendChild(successDiv);

        setTimeout(() => {
            successDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => successDiv.remove(), 300);
        }, 4000);

        // Reset selections
        selectedTests.forEach(test => {
            test.checkbox.checked = false;
        });
        selectedTests = [];
        updateOrderSummary();
    }

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
});
