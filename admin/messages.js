// Messages Module - Microafia Admin
let messagesData = [];
let currentFilter = 'all';
let currentSearch = '';
let currentViewEmail = '';

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initMessages();
});

function initMessages() {
    // Set up real-time listener for messages
    firebase.firestore().collection('contact_messages')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            messagesData = [];
            snapshot.forEach((doc) => {
                messagesData.push({ id: doc.id, ...doc.data() });
            });
            updateMiniStats();
            renderMessages();
        }, (error) => {
            console.error('Error fetching messages:', error);
            document.getElementById('messagesTableBody').innerHTML = `
                <tr>
                    <td colspan="7" class="loading-row">
                        <i class="fas fa-exclamation-circle"></i> Error loading messages
                    </td>
                </tr>
            `;
        });

    // Set up filter listeners
    document.getElementById('statusFilter').addEventListener('change', function() {
        currentFilter = this.value;
        renderMessages();
    });

    document.getElementById('searchInput').addEventListener('input', function() {
        currentSearch = this.value.toLowerCase();
        renderMessages();
    });

    // Reply email button
    document.getElementById('replyEmailBtn').addEventListener('click', function() {
        if (currentViewEmail) {
            window.location.href = `mailto:${currentViewEmail}`;
        }
    });
}

function updateMiniStats() {
    const unread = messagesData.filter(m => m.status === 'unread' || !m.status).length;
    const replied = messagesData.filter(m => m.status === 'replied').length;
    
    document.getElementById('unreadCount').textContent = unread;
    document.getElementById('repliedCount').textContent = replied;
}

function renderMessages() {
    const tbody = document.getElementById('messagesTableBody');
    const emptyState = document.getElementById('emptyState');
    
    // Filter messages
    let filtered = messagesData.filter(msg => {
        // Status filter
        if (currentFilter !== 'all') {
            const msgStatus = msg.status || 'unread';
            if (msgStatus !== currentFilter) return false;
        }
        
        // Search filter
        if (currentSearch) {
            const searchStr = `${msg.name || ''} ${msg.phone || ''} ${msg.email || ''} ${msg.message || ''} ${msg.service || ''}`.toLowerCase();
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
    
    tbody.innerHTML = filtered.map(msg => {
        const status = msg.status || 'unread';
        const isUnread = status === 'unread';
        const createdAt = msg.createdAt ? formatDate(msg.createdAt.toDate()) : 'N/A';
        const messagePreview = (msg.message || '').substring(0, 50) + ((msg.message || '').length > 50 ? '...' : '');
        
        return `
            <tr class="${isUnread ? 'unread-row' : ''}">
                <td>
                    <div class="sender-info">
                        <span class="sender-name">
                            ${isUnread ? '<span class="unread-dot"></span>' : ''}
                            ${msg.name || 'N/A'}
                        </span>
                        <span class="sender-email">${msg.email || ''}</span>
                    </div>
                </td>
                <td>${msg.phone || 'N/A'}</td>
                <td>
                    <span class="service-badge">${msg.service || 'General'}</span>
                </td>
                <td>
                    <span class="message-preview">${messagePreview || 'No message'}</span>
                </td>
                <td class="date-cell">${createdAt}</td>
                <td>
                    <select class="status-select" onchange="updateStatus('${msg.id}', this.value)">
                        <option value="unread" ${status === 'unread' ? 'selected' : ''}>Unread</option>
                        <option value="read" ${status === 'read' ? 'selected' : ''}>Read</option>
                        <option value="replied" ${status === 'replied' ? 'selected' : ''}>Replied</option>
                    </select>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action btn-view" onclick="viewMessage('${msg.id}')" title="View Message">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-action btn-note" onclick="openNoteModal('${msg.id}')" title="Add Note">
                            <i class="fas fa-sticky-note"></i>
                        </button>
                        <button class="btn-action btn-reply" onclick="replyEmail('${msg.email}')" title="Reply via Email">
                            <i class="fas fa-reply"></i>
                        </button>
                        <button class="btn-action btn-delete" onclick="openDeleteModal('${msg.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateStatus(msgId, newStatus) {
    firebase.firestore().collection('contact_messages').doc(msgId).update({
        status: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast('Status updated successfully');
    }).catch((error) => {
        console.error('Error updating status:', error);
        showToast('Error updating status', 'error');
    });
}

function viewMessage(msgId) {
    const msg = messagesData.find(m => m.id === msgId);
    if (!msg) return;
    
    // Mark as read if unread
    if (msg.status === 'unread' || !msg.status) {
        firebase.firestore().collection('contact_messages').doc(msgId).update({
            status: 'read',
            readAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    const status = msg.status || 'unread';
    const createdAt = msg.createdAt ? formatDate(msg.createdAt.toDate()) : 'N/A';
    currentViewEmail = msg.email || '';
    
    document.getElementById('viewModalBody').innerHTML = `
        <div class="detail-row">
            <span class="detail-label">From</span>
            <span class="detail-value">${msg.name || 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Email</span>
            <span class="detail-value">${msg.email || 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Phone</span>
            <span class="detail-value">${msg.phone || 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Service</span>
            <span class="detail-value"><span class="service-badge">${msg.service || 'General'}</span></span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Received</span>
            <span class="detail-value">${createdAt}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value"><span class="status-badge ${status}">${status}</span></span>
        </div>
        <div class="detail-row" style="flex-direction: column;">
            <span class="detail-label" style="margin-bottom: 8px;">Message</span>
            <div class="message-content">${msg.message || 'No message content'}</div>
        </div>
        ${msg.adminNotes ? `
        <div class="detail-row">
            <span class="detail-label">Admin Notes</span>
            <span class="detail-value">${msg.adminNotes}</span>
        </div>
        ` : ''}
    `;
    
    openModal('viewModal');
}

function replyEmail(email) {
    if (email) {
        window.location.href = `mailto:${email}`;
    }
}

function openNoteModal(msgId) {
    const msg = messagesData.find(m => m.id === msgId);
    if (!msg) return;
    
    document.getElementById('noteMessageId').value = msgId;
    document.getElementById('noteText').value = '';
    
    // Show existing notes
    const existingNotes = document.getElementById('existingNotes');
    if (msg.adminNotes) {
        existingNotes.innerHTML = `
            <div class="existing-note">
                <div class="existing-note-text">${msg.adminNotes}</div>
                <div class="existing-note-date">Previous note</div>
            </div>
        `;
    } else {
        existingNotes.innerHTML = '';
    }
    
    openModal('noteModal');
}

function saveNote() {
    const msgId = document.getElementById('noteMessageId').value;
    const noteText = document.getElementById('noteText').value.trim();
    
    if (!noteText) {
        showToast('Please enter a note', 'error');
        return;
    }
    
    firebase.firestore().collection('contact_messages').doc(msgId).update({
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

function openDeleteModal(msgId) {
    document.getElementById('deleteMessageId').value = msgId;
    openModal('deleteModal');
}

function confirmDelete() {
    const msgId = document.getElementById('deleteMessageId').value;
    
    firebase.firestore().collection('contact_messages').doc(msgId).delete()
        .then(() => {
            closeModal('deleteModal');
            showToast('Message deleted successfully');
        }).catch((error) => {
            console.error('Error deleting message:', error);
            showToast('Error deleting message', 'error');
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
