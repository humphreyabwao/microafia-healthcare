// Wellness Module - Microafia Admin
let wellnessData = [];
let currentStatusFilter = 'all';
let currentPackageFilter = 'all';
let currentSearch = '';

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initWellness();
});

function initWellness() {
    // Set up real-time listener for wellness bookings
    firebase.firestore().collection('wellness_bookings')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            wellnessData = [];
            snapshot.forEach((doc) => {
                wellnessData.push({ id: doc.id, ...doc.data() });
            });
            updateMiniStats();
            renderWellnessBookings();
        }, (error) => {
            console.error('Error fetching wellness bookings:', error);
            document.getElementById('wellnessTableBody').innerHTML = `
                <tr>
                    <td colspan="7" class="loading-row">
                        <i class="fas fa-exclamation-circle"></i> Error loading wellness bookings
                    </td>
                </tr>
            `;
        });

    // Set up filter listeners
    document.getElementById('statusFilter').addEventListener('change', function() {
        currentStatusFilter = this.value;
        renderWellnessBookings();
    });

    document.getElementById('packageFilter').addEventListener('change', function() {
        currentPackageFilter = this.value;
        renderWellnessBookings();
    });

    document.getElementById('searchInput').addEventListener('input', function() {
        currentSearch = this.value.toLowerCase();
        renderWellnessBookings();
    });
}

function updateMiniStats() {
    const pending = wellnessData.filter(b => b.status === 'pending' || !b.status).length;
    const completed = wellnessData.filter(b => b.status === 'completed').length;
    
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('completedCount').textContent = completed;
}

function renderWellnessBookings() {
    const tbody = document.getElementById('wellnessTableBody');
    const emptyState = document.getElementById('emptyState');
    
    // Filter bookings
    let filtered = wellnessData.filter(booking => {
        // Status filter
        if (currentStatusFilter !== 'all') {
            const bookingStatus = booking.status || 'pending';
            if (bookingStatus !== currentStatusFilter) return false;
        }
        
        // Package filter
        if (currentPackageFilter !== 'all') {
            if (booking.package !== currentPackageFilter) return false;
        }
        
        // Search filter
        if (currentSearch) {
            const searchStr = `${booking.fullName || ''} ${booking.phone || ''} ${booking.email || ''} ${booking.packageName || ''}`.toLowerCase();
            if (!searchStr.includes(currentSearch)) return false;
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
    
    tbody.innerHTML = filtered.map(booking => {
        const status = booking.status || 'pending';
        const pkg = booking.package || 'basic';
        const packageName = booking.packageName || 'Basic Checkup';
        const packagePrice = booking.packagePrice || 0;
        const members = booking.members || '1';
        
        return `
            <tr>
                <td>
                    <div class="customer-info">
                        <span class="customer-name">${escapeAdminHTML(booking.fullName || 'N/A')}</span>
                        <span class="customer-email">${escapeAdminHTML(booking.email || '')}</span>
                    </div>
                </td>
                <td>${escapeAdminHTML(booking.phone || 'N/A')}</td>
                <td>
                    <span class="package-badge ${escapeAdminHTML(pkg)}">${escapeAdminHTML(packageName)}</span>
                    <span class="package-price">KSh ${packagePrice.toLocaleString()}</span>
                </td>
                <td>
                    <div class="datetime-info">
                        <span class="datetime-date">${escapeAdminHTML(booking.preferredDate || 'N/A')}</span>
                        <span class="datetime-time">${escapeAdminHTML(booking.preferredTimeSlot || booking.preferredTime || '')}</span>
                    </div>
                </td>
                <td>
                    <span class="members-badge">
                        <i class="fas fa-users"></i> ${escapeAdminHTML(members)}
                    </span>
                </td>
                <td>
                    <select class="status-select" onchange="updateStatus('${escapeAdminJSArgument(booking.id)}', this.value)">
                        <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="confirmed" ${status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                        <option value="completed" ${status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action btn-view" onclick="viewBooking('${escapeAdminJSArgument(booking.id)}')" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-action btn-note" onclick="openNoteModal('${escapeAdminJSArgument(booking.id)}')" title="Add Note">
                            <i class="fas fa-sticky-note"></i>
                        </button>
                        <button class="btn-action btn-complete" onclick="markComplete('${escapeAdminJSArgument(booking.id)}')" title="Mark Complete">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-action btn-delete" onclick="openDeleteModal('${escapeAdminJSArgument(booking.id)}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateStatus(bookingId, newStatus) {
    firebase.firestore().collection('wellness_bookings').doc(bookingId).update({
        status: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast('Status updated successfully');
    }).catch((error) => {
        console.error('Error updating status:', error);
        showToast('Error updating status', 'error');
    });
}

function viewBooking(bookingId) {
    const booking = wellnessData.find(b => b.id === bookingId);
    if (!booking) return;
    
    const status = booking.status || 'pending';
    const createdAt = booking.createdAt ? formatDate(booking.createdAt.toDate()) : 'N/A';
    
    document.getElementById('viewModalBody').innerHTML = `
        <div class="detail-row">
            <span class="detail-label">Full Name</span>
            <span class="detail-value">${escapeAdminHTML(booking.fullName || 'N/A')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Phone</span>
            <span class="detail-value">${escapeAdminHTML(booking.phone || 'N/A')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Email</span>
            <span class="detail-value">${escapeAdminHTML(booking.email || 'N/A')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Package</span>
            <span class="detail-value">
                <span class="package-badge ${escapeAdminHTML(booking.package || 'basic')}">${escapeAdminHTML(booking.packageName || 'Basic Checkup')}</span>
            </span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Price</span>
            <span class="detail-value" style="font-weight: 600; color: #064e3b;">KSh ${escapeAdminHTML((booking.packagePrice || 0).toLocaleString())}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Preferred Date</span>
            <span class="detail-value">${escapeAdminHTML(booking.preferredDate || 'N/A')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Preferred Time</span>
            <span class="detail-value">${escapeAdminHTML(booking.preferredTimeSlot || booking.preferredTime || 'N/A')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Members</span>
            <span class="detail-value">${escapeAdminHTML(booking.members || '1')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Customer Notes</span>
            <span class="detail-value">${escapeAdminHTML(booking.notes || 'None')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value"><span class="status-badge ${escapeAdminHTML(status)}">${escapeAdminHTML(status)}</span></span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Booked On</span>
            <span class="detail-value">${createdAt}</span>
        </div>
        ${booking.adminNotes ? `
        <div class="detail-row">
            <span class="detail-label">Admin Notes</span>
            <span class="detail-value">${escapeAdminHTML(booking.adminNotes)}</span>
        </div>
        ` : ''}
    `;
    
    openModal('viewModal');
}

function openNoteModal(bookingId) {
    const booking = wellnessData.find(b => b.id === bookingId);
    if (!booking) return;
    
    document.getElementById('noteBookingId').value = bookingId;
    document.getElementById('noteText').value = '';
    
    // Show existing notes
    const existingNotes = document.getElementById('existingNotes');
    if (booking.adminNotes) {
        existingNotes.innerHTML = `
            <div class="existing-note">
                <div class="existing-note-text">${escapeAdminHTML(booking.adminNotes)}</div>
                <div class="existing-note-date">Previous note</div>
            </div>
        `;
    } else {
        existingNotes.innerHTML = '';
    }
    
    openModal('noteModal');
}

function saveNote() {
    const bookingId = document.getElementById('noteBookingId').value;
    const noteText = document.getElementById('noteText').value.trim();
    
    if (!noteText) {
        showToast('Please enter a note', 'error');
        return;
    }
    
    firebase.firestore().collection('wellness_bookings').doc(bookingId).update({
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

function markComplete(bookingId) {
    firebase.firestore().collection('wellness_bookings').doc(bookingId).update({
        status: 'completed',
        completedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast('Booking marked as completed');
    }).catch((error) => {
        console.error('Error updating status:', error);
        showToast('Error updating status', 'error');
    });
}

function openDeleteModal(bookingId) {
    document.getElementById('deleteBookingId').value = bookingId;
    openModal('deleteModal');
}

function confirmDelete() {
    const bookingId = document.getElementById('deleteBookingId').value;
    
    firebase.firestore().collection('wellness_bookings').doc(bookingId).delete()
        .then(() => {
            closeModal('deleteModal');
            showToast('Booking deleted successfully');
        }).catch((error) => {
            console.error('Error deleting booking:', error);
            showToast('Error deleting booking', 'error');
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
