// Callbacks Module - Microafia Admin
let callbacksData = [];
let currentFilter = 'all';
let currentSearch = '';

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initCallbacks();
});

function initCallbacks() {
    // Set up real-time listener for callback requests
    firebase.firestore().collection('callback_requests')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            callbacksData = [];
            snapshot.forEach((doc) => {
                callbacksData.push({ id: doc.id, ...doc.data() });
            });
            updateMiniStats();
            renderCallbacks();
        }, (error) => {
            console.error('Error fetching callbacks:', error);
            document.getElementById('callbacksTableBody').innerHTML = `
                <tr>
                    <td colspan="5" class="loading-row">
                        <i class="fas fa-exclamation-circle"></i> Error loading callback requests
                    </td>
                </tr>
            `;
        });

    // Set up filter listeners
    document.getElementById('statusFilter').addEventListener('change', function() {
        currentFilter = this.value;
        renderCallbacks();
    });

    document.getElementById('searchInput').addEventListener('input', function() {
        currentSearch = this.value.toLowerCase();
        renderCallbacks();
    });
}

function updateMiniStats() {
    const pending = callbacksData.filter(c => c.status === 'pending' || !c.status).length;
    const completed = callbacksData.filter(c => c.status === 'completed').length;
    
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('completedCount').textContent = completed;
}

function renderCallbacks() {
    const tbody = document.getElementById('callbacksTableBody');
    const emptyState = document.getElementById('emptyState');
    
    // Filter callbacks
    let filtered = callbacksData.filter(callback => {
        // Status filter
        if (currentFilter !== 'all') {
            const callbackStatus = callback.status || 'pending';
            if (callbackStatus !== currentFilter) return false;
        }
        
        // Search filter
        if (currentSearch) {
            const searchStr = `${callback.name || ''} ${callback.phone || ''}`.toLowerCase();
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
    
    tbody.innerHTML = filtered.map(callback => {
        const status = callback.status || 'pending';
        const isPending = status === 'pending';
        const createdAt = callback.createdAt ? formatDate(callback.createdAt.toDate()) : 'N/A';
        const phone = callback.phone || 'N/A';
        
        return `
            <tr class="${isPending ? 'pending-row' : ''}">
                <td>
                    <span class="name-cell">
                        ${isPending ? '<span class="pending-dot"></span>' : ''}
                        ${callback.name || 'N/A'}
                    </span>
                </td>
                <td>
                    <div class="phone-cell">
                        <a href="tel:${phone}">${phone}</a>
                        <a href="tel:${phone}" class="call-btn" title="Call Now">
                            <i class="fas fa-phone"></i>
                        </a>
                    </div>
                </td>
                <td class="date-cell">${createdAt}</td>
                <td>
                    <select class="status-select" onchange="updateStatus('${callback.id}', this.value)">
                        <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="called" ${status === 'called' ? 'selected' : ''}>Called</option>
                        <option value="completed" ${status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </td>
                <td>
                    <div class="action-buttons">
                        <a href="tel:${phone}" class="btn-action btn-call" title="Call Now">
                            <i class="fas fa-phone"></i>
                        </a>
                        <button class="btn-action btn-note" onclick="openNoteModal('${callback.id}')" title="Add Note">
                            <i class="fas fa-sticky-note"></i>
                        </button>
                        <button class="btn-action btn-complete" onclick="markComplete('${callback.id}')" title="Mark Complete">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-action btn-delete" onclick="openDeleteModal('${callback.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateStatus(callbackId, newStatus) {
    const updateData = {
        status: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Add calledAt timestamp when status changes to 'called'
    if (newStatus === 'called') {
        updateData.calledAt = firebase.firestore.FieldValue.serverTimestamp();
    }
    
    // Add completedAt timestamp when status changes to 'completed'
    if (newStatus === 'completed') {
        updateData.completedAt = firebase.firestore.FieldValue.serverTimestamp();
    }
    
    firebase.firestore().collection('callback_requests').doc(callbackId).update(updateData)
        .then(() => {
            showToast('Status updated successfully');
        }).catch((error) => {
            console.error('Error updating status:', error);
            showToast('Error updating status', 'error');
        });
}

function openNoteModal(callbackId) {
    const callback = callbacksData.find(c => c.id === callbackId);
    if (!callback) return;
    
    document.getElementById('noteCallbackId').value = callbackId;
    document.getElementById('noteText').value = '';
    
    // Show existing notes
    const existingNotes = document.getElementById('existingNotes');
    if (callback.adminNotes) {
        existingNotes.innerHTML = `
            <div class="existing-note">
                <div class="existing-note-text">${callback.adminNotes}</div>
                <div class="existing-note-date">Previous note</div>
            </div>
        `;
    } else {
        existingNotes.innerHTML = '';
    }
    
    openModal('noteModal');
}

function saveNote() {
    const callbackId = document.getElementById('noteCallbackId').value;
    const noteText = document.getElementById('noteText').value.trim();
    
    if (!noteText) {
        showToast('Please enter a note', 'error');
        return;
    }
    
    firebase.firestore().collection('callback_requests').doc(callbackId).update({
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

function markComplete(callbackId) {
    firebase.firestore().collection('callback_requests').doc(callbackId).update({
        status: 'completed',
        completedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast('Marked as completed');
    }).catch((error) => {
        console.error('Error updating status:', error);
        showToast('Error updating status', 'error');
    });
}

function openDeleteModal(callbackId) {
    document.getElementById('deleteCallbackId').value = callbackId;
    openModal('deleteModal');
}

function confirmDelete() {
    const callbackId = document.getElementById('deleteCallbackId').value;
    
    firebase.firestore().collection('callback_requests').doc(callbackId).delete()
        .then(() => {
            closeModal('deleteModal');
            showToast('Callback request deleted');
        }).catch((error) => {
            console.error('Error deleting callback:', error);
            showToast('Error deleting callback', 'error');
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
