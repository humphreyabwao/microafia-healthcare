// Lab Orders Module - Microafia Admin
let labOrdersData = [];
let currentFilter = 'all';
let currentSearch = '';

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initLabOrders();
});

function initLabOrders() {
    // Set up real-time listener for lab orders
    firebase.firestore().collection('lab_orders')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            labOrdersData = [];
            snapshot.forEach((doc) => {
                labOrdersData.push({ id: doc.id, ...doc.data() });
            });
            updateMiniStats();
            renderLabOrders();
        }, (error) => {
            console.error('Error fetching lab orders:', error);
            document.getElementById('labOrdersTableBody').innerHTML = `
                <tr>
                    <td colspan="7" class="loading-row">
                        <i class="fas fa-exclamation-circle"></i> Error loading lab orders
                    </td>
                </tr>
            `;
        });

    // Set up filter listeners
    document.getElementById('statusFilter').addEventListener('change', function() {
        currentFilter = this.value;
        renderLabOrders();
    });

    document.getElementById('searchInput').addEventListener('input', function() {
        currentSearch = this.value.toLowerCase();
        renderLabOrders();
    });
}

function updateMiniStats() {
    const pending = labOrdersData.filter(o => o.status === 'pending' || !o.status).length;
    const completed = labOrdersData.filter(o => o.status === 'completed').length;
    
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('completedCount').textContent = completed;
}

// Imaging and DNA requests share lab_orders; tag them so staff can tell them apart.
const LAB_ORDER_KINDS = { imaging: 'Imaging', dna: 'DNA' };
function labOrderKindTag(order) {
    const label = LAB_ORDER_KINDS[order.category];
    return label ? `<span class="order-kind order-kind--${escapeAdminHTML(order.category)}">${label}</span>` : '';
}
function labOrderVisit(order) {
    if (order.collectionMethod === 'mobile') return `Mobile visit: ${order.location || 'location not given'}`;
    if (order.collectionMethod === 'clinic') return 'At the clinic';
    if (order.collectionMethod) return `${order.collectionMethod}${order.location ? ': ' + order.location : ''}`;
    return '';
}

function renderLabOrders() {
    const tbody = document.getElementById('labOrdersTableBody');
    const emptyState = document.getElementById('emptyState');
    
    // Filter orders
    let filtered = labOrdersData.filter(order => {
        // Status filter
        if (currentFilter !== 'all') {
            const orderStatus = order.status || 'pending';
            if (orderStatus !== currentFilter) return false;
        }
        
        // Search filter
        if (currentSearch) {
            const searchStr = `${order.customerName || ''} ${order.phone || ''} ${order.email || ''}`.toLowerCase();
            const testsStr = (order.tests || []).map(t => t.name).join(' ').toLowerCase();
            if (!searchStr.includes(currentSearch) && !testsStr.includes(currentSearch)) return false;
        }
        
        return true;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        document.querySelector('.table-responsive').style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    document.querySelector('.table-responsive').style.display = 'block';
    
    tbody.innerHTML = filtered.map(order => {
        const status = order.status || 'pending';
        const tests = order.tests || [];
        const total = order.total || 0;
        
        // Show first 2 tests
        let testsHTML = '';
        if (tests.length > 0) {
            const visibleTests = tests.slice(0, 2);
            testsHTML = visibleTests.map(t => `<span class="test-badge">${escapeAdminHTML(t.name)}</span>`).join('');
            if (tests.length > 2) {
                testsHTML += `<span class="tests-more" onclick="viewOrder('${escapeAdminJSArgument(order.id)}')">+${tests.length - 2} more</span>`;
            }
        } else {
            testsHTML = `<span class="no-prescription">${escapeAdminHTML(order.prescription ? 'See lab request' : 'No tests')}</span>`;
        }
        
        // Prescription link
        let prescriptionHTML = '';
        if (order.prescription && order.prescription.url) {
            prescriptionHTML = `<a href="${escapeAdminHTML(safeAdminURL(order.prescription.url))}" target="_blank" class="prescription-link"><i class="fas fa-file-medical"></i> View</a>`;
        } else {
            prescriptionHTML = '<span class="no-prescription">None</span>';
        }
        
        return `
            <tr>
                <td>
                    <div class="customer-info">
                        <span class="customer-name">${escapeAdminHTML(order.customerName || 'N/A')} ${labOrderKindTag(order)}</span>
                        <span class="customer-email">${escapeAdminHTML(order.email || '')}</span>
                    </div>
                </td>
                <td>${escapeAdminHTML(order.phone || 'N/A')}</td>
                <td data-export="${escapeAdminHTML(tests.map(t => t.name).filter(Boolean).join(', '))}">
                    <div class="tests-list">
                        ${testsHTML}
                    </div>
                </td>
                <td><span class="total-price">${escapeAdminHTML(order.pricingStatus === 'requires_review' ? 'To be confirmed' : `KSh ${total.toLocaleString()}`)}</span></td>
                <td>${prescriptionHTML}</td>
                <td>
                    <select class="status-select" onchange="updateStatus('${escapeAdminJSArgument(order.id)}', this.value)">
                        <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="processing" ${status === 'processing' ? 'selected' : ''}>Processing</option>
                        <option value="ready" ${status === 'ready' ? 'selected' : ''}>Ready</option>
                        <option value="completed" ${status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action btn-view" onclick="viewOrder('${escapeAdminJSArgument(order.id)}')" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-action btn-note" onclick="openNoteModal('${escapeAdminJSArgument(order.id)}')" title="Add Note">
                            <i class="fas fa-sticky-note"></i>
                        </button>
                        <button class="btn-action btn-complete" onclick="markComplete('${escapeAdminJSArgument(order.id)}')" title="Mark Complete">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-action btn-delete" onclick="openDeleteModal('${escapeAdminJSArgument(order.id)}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateStatus(orderId, newStatus) {
    firebase.firestore().collection('lab_orders').doc(orderId).update({
        status: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast('Status updated successfully');
    }).catch((error) => {
        console.error('Error updating status:', error);
        showToast('Error updating status', 'error');
    });
}

function viewOrder(orderId) {
    const order = labOrdersData.find(o => o.id === orderId);
    if (!order) return;
    
    const status = order.status || 'pending';
    const tests = order.tests || [];
    const total = order.total || 0;
    const createdAt = order.createdAt ? formatDate(order.createdAt.toDate()) : 'N/A';
    
    // Build tests list
    let testsHTML = '';
    if (tests.length > 0) {
        testsHTML = tests.map(t => `
            <div class="test-item">
                <span class="test-item-name">${escapeAdminHTML(t.name)}</span>
                <span class="test-item-price">KSh ${escapeAdminHTML((t.price || 0).toLocaleString())}</span>
            </div>
        `).join('');
    } else {
        testsHTML = `<span style="color: #9ca3af;">${escapeAdminHTML(order.prescription ? 'See attached lab request' : 'No tests ordered')}</span>`;
    }
    
    // Prescription
    let prescriptionHTML = 'None';
    if (order.prescription && order.prescription.url) {
        prescriptionHTML = `<a href="${escapeAdminHTML(safeAdminURL(order.prescription.url))}" target="_blank" class="prescription-link"><i class="fas fa-file-medical"></i> ${escapeLabRequestText(order.prescription.name || 'View Prescription')}</a>`;
    }
    
    document.getElementById('viewModalBody').innerHTML = `
        <div class="detail-row">
            <span class="detail-label">Customer</span>
            <span class="detail-value">${escapeAdminHTML(order.customerName || 'N/A')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Phone</span>
            <span class="detail-value">${escapeAdminHTML(order.phone || 'N/A')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Email</span>
            <span class="detail-value">${escapeAdminHTML(order.email || 'N/A')}</span>
        </div>
        ${LAB_ORDER_KINDS[order.category] ? `
        <div class="detail-row">
            <span class="detail-label">Type</span>
            <span class="detail-value">${labOrderKindTag(order)}</span>
        </div>` : ''}
        ${labOrderVisit(order) ? `
        <div class="detail-row">
            <span class="detail-label">Visit</span>
            <span class="detail-value">${escapeAdminHTML(labOrderVisit(order))}</span>
        </div>` : ''}
        <div class="detail-row">
            <span class="detail-label">Tests</span>
            <div class="detail-value tests-detail">
                ${testsHTML}
            </div>
        </div>
        <div class="detail-row">
            <span class="detail-label">Total</span>
            <span class="detail-value total-price">${escapeAdminHTML(order.pricingStatus === 'requires_review' ? 'To be confirmed' : `KSh ${total.toLocaleString()}`)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Prescription</span>
            <span class="detail-value">${prescriptionHTML}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Customer Notes</span>
            <span class="detail-value">${escapeAdminHTML(order.notes || 'None')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value"><span class="status-badge ${escapeAdminHTML(status)}">${escapeAdminHTML(status)}</span></span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Order Date</span>
            <span class="detail-value">${createdAt}</span>
        </div>
        ${order.adminNotes ? `
        <div class="detail-row">
            <span class="detail-label">Admin Notes</span>
            <span class="detail-value">${escapeAdminHTML(order.adminNotes)}</span>
        </div>
        ` : ''}
    `;
    
    openModal('viewModal');
}

function openNoteModal(orderId) {
    const order = labOrdersData.find(o => o.id === orderId);
    if (!order) return;
    
    document.getElementById('noteOrderId').value = orderId;
    document.getElementById('noteText').value = '';
    
    // Show existing notes
    const existingNotes = document.getElementById('existingNotes');
    if (order.adminNotes) {
        existingNotes.innerHTML = `
            <div class="existing-note">
                <div class="existing-note-text">${escapeAdminHTML(order.adminNotes)}</div>
                <div class="existing-note-date">Previous note</div>
            </div>
        `;
    } else {
        existingNotes.innerHTML = '';
    }
    
    openModal('noteModal');
}

function saveNote() {
    const orderId = document.getElementById('noteOrderId').value;
    const noteText = document.getElementById('noteText').value.trim();
    
    if (!noteText) {
        showToast('Please enter a note', 'error');
        return;
    }
    
    firebase.firestore().collection('lab_orders').doc(orderId).update({
        adminNotes: noteText,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        closeModal('noteModal');
        showToast('Note saved successfully');
    }).catch((error) => {
        console.error('Error saving note:', error);
        showToast('Error saving note', 'error');
    });
}

function markComplete(orderId) {
    firebase.firestore().collection('lab_orders').doc(orderId).update({
        status: 'completed',
        completedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast('Order marked as completed');
    }).catch((error) => {
        console.error('Error updating status:', error);
        showToast('Error updating status', 'error');
    });
}

function openDeleteModal(orderId) {
    document.getElementById('deleteOrderId').value = orderId;
    openModal('deleteModal');
}

function confirmDelete() {
    const orderId = document.getElementById('deleteOrderId').value;
    
    firebase.firestore().collection('lab_orders').doc(orderId).delete()
        .then(() => {
            closeModal('deleteModal');
            showToast('Order deleted successfully');
        }).catch((error) => {
            console.error('Error deleting order:', error);
            showToast('Error deleting order', 'error');
        });
}

// Modal helpers
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = toast.querySelector('i');
    
    toastMessage.textContent = message;
    
    if (type === 'error') {
        toast.style.background = '#dc2626';
        toastIcon.className = 'fas fa-exclamation-circle';
    } else {
        toast.style.background = '#064e3b';
        toastIcon.className = 'fas fa-check-circle';
    }
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Date formatter
function formatDate(date) {
    if (!date) return 'N/A';
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Close modals when clicking outside
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// Close modals with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

function escapeLabRequestText(value) {
    const text = document.createElement('span');
    text.textContent = value;
    return text.innerHTML;
}
