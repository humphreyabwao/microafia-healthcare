/* ========================================
   Appointments Module JavaScript
   ======================================== */

// Global variables
let allAppointments = [];
let currentFilter = 'all';
let searchTerm = '';

// DOM Elements
const tableBody = document.getElementById('appointmentsTableBody');
const emptyState = document.getElementById('emptyState');
const statusFilter = document.getElementById('statusFilter');
const searchInput = document.getElementById('searchInput');

// Initialize real-time listener
function initAppointments() {
    db.collection('appointments')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            allAppointments = [];
            snapshot.forEach(doc => {
                allAppointments.push({ id: doc.id, ...doc.data() });
            });
            renderAppointments();
        }, (error) => {
            console.error('Error fetching appointments:', error);
            tableBody.innerHTML = `<tr><td colspan="7" class="loading-row">Error loading appointments</td></tr>`;
        });
}

// Render appointments table
function renderAppointments() {
    let filtered = [...allAppointments];

    // Update mini stats
    const pendingCount = allAppointments.filter(a => (a.status || 'pending') === 'pending').length;
    const completedCount = allAppointments.filter(a => a.status === 'completed').length;
    document.getElementById('pendingCount').textContent = pendingCount;
    document.getElementById('completedCount').textContent = completedCount;

    // Apply status filter
    if (currentFilter !== 'all') {
        filtered = filtered.filter(apt => (apt.status || 'pending') === currentFilter);
    }

    // Apply search filter
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(apt => {
            const fullName = `${apt.firstName || ''} ${apt.lastName || ''}`.toLowerCase();
            return fullName.includes(term) ||
                (apt.phone || '').toLowerCase().includes(term) ||
                (apt.serviceName || '').toLowerCase().includes(term);
        });
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = '';
        emptyState.style.display = 'block';
        document.querySelector('.table-responsive').style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    document.querySelector('.table-responsive').style.display = 'block';

    tableBody.innerHTML = filtered.map(apt => {
        const status = apt.status || 'pending';
        const hasNotes = apt.notes && apt.notes.length > 0;
        const fullName = `${apt.firstName || ''} ${apt.lastName || ''}`.trim() || '-';
        const serviceClass = getServiceClass(apt.service);
        const serviceName = apt.serviceName || apt.service || '-';
        
        return `
            <tr data-id="${escapeAdminHTML(apt.id)}">
                <td><strong>${escapeAdminHTML(fullName)}</strong></td>
                <td>${escapeAdminHTML(apt.phone || '-')}</td>
                <td><span class="service-badge ${escapeAdminHTML(serviceClass)}">${escapeAdminHTML(serviceName)}</span></td>
                <td>${escapeAdminHTML(apt.preferredDate || '-')}</td>
                <td>${escapeAdminHTML(apt.preferredTime || '-')}</td>
                <td>
                    <div class="status-dropdown" onclick="toggleStatusDropdown(event, '${escapeAdminJSArgument(apt.id)}')">
                        <span class="status-badge ${escapeAdminHTML(status)}">${escapeAdminHTML(formatStatus(status))}</span>
                        <div class="status-options">
                            <button class="status-option ${status === 'pending' ? 'active' : ''}" onclick="updateStatus(event, '${escapeAdminJSArgument(apt.id)}', 'pending')">Pending</button>
                            <button class="status-option ${status === 'reviewed' ? 'active' : ''}" onclick="updateStatus(event, '${escapeAdminJSArgument(apt.id)}', 'reviewed')">Reviewed</button>
                            <button class="status-option ${status === 'in-progress' ? 'active' : ''}" onclick="updateStatus(event, '${escapeAdminJSArgument(apt.id)}', 'in-progress')">In Progress</button>
                            <button class="status-option ${status === 'completed' ? 'active' : ''}" onclick="updateStatus(event, '${escapeAdminJSArgument(apt.id)}', 'completed')">Completed</button>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn view" title="View Details" onclick="viewAppointment('${escapeAdminJSArgument(apt.id)}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="action-btn note ${hasNotes ? 'has-notes' : ''}" title="Add Note" onclick="openNoteModal('${escapeAdminJSArgument(apt.id)}')">
                            <i class="fas fa-sticky-note"></i>
                        </button>
                        <button class="action-btn complete" title="Mark Complete" onclick="markComplete('${escapeAdminJSArgument(apt.id)}')">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="action-btn delete" title="Delete" onclick="openDeleteModal('${escapeAdminJSArgument(apt.id)}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Format status for display
function formatStatus(status) {
    const statusMap = {
        'pending': 'Pending',
        'reviewed': 'Reviewed',
        'in-progress': 'In Progress',
        'completed': 'Completed'
    };
    return statusMap[status] || status;
}

// Get service badge class
function getServiceClass(service) {
    const validServices = [
        'consultation', 'general-treatment', 'follow-up',
        'dental', 'ultrasound', 'lab-services', 'pharmacy',
        'minor-surgery', 'circumcision', 'wound-care',
        'antenatal', 'postnatal', 'immunization', 'family-planning',
        'women-wellness', 'men-wellness', 'family-wellness', 'executive-checkup',
        'dna-paternity'
    ];
    return validServices.includes(service) ? service : 'default';
}

// Toggle status dropdown
function toggleStatusDropdown(event, id) {
    event.stopPropagation();
    const dropdown = event.currentTarget;
    
    // Close all other dropdowns
    document.querySelectorAll('.status-dropdown.active').forEach(d => {
        if (d !== dropdown) d.classList.remove('active');
    });
    
    dropdown.classList.toggle('active');
}

// Close dropdowns when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.status-dropdown.active').forEach(d => {
        d.classList.remove('active');
    });
});

// Update appointment status
async function updateStatus(event, id, newStatus) {
    event.stopPropagation();
    
    try {
        await db.collection('appointments').doc(id).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(`Status updated to ${escapeAdminHTML(formatStatus(newStatus))}`, 'success');
    } catch (error) {
        console.error('Error updating status:', error);
        showToast('Error updating status', 'error');
    }
}

// Mark as complete
async function markComplete(id) {
    try {
        await db.collection('appointments').doc(id).update({
            status: 'completed',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Appointment marked as completed', 'success');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error updating appointment', 'error');
    }
}

// View appointment details
function viewAppointment(id) {
    const apt = allAppointments.find(a => a.id === id);
    if (!apt) return;

    const modalBody = document.getElementById('viewModalBody');
    const createdAt = apt.createdAt ? apt.createdAt.toDate().toLocaleString() : '-';
    const fullName = `${apt.firstName || ''} ${apt.lastName || ''}`.trim() || '-';
    const notesHtml = apt.notes && apt.notes.length > 0 
        ? apt.notes.map(n => `
            <div class="note-item">
                <div class="note-text">${escapeAdminHTML(n.text)}</div>
                <div class="note-date">${escapeAdminHTML(n.date)}</div>
            </div>
        `).join('')
        : '<p style="color: var(--gray-400); font-size: 0.85rem;">No notes added</p>';

    modalBody.innerHTML = `
        <div class="detail-row">
            <span class="detail-label">Patient Name</span>
            <span class="detail-value">${escapeAdminHTML(fullName)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Phone</span>
            <span class="detail-value">${escapeAdminHTML(apt.phone || '-')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Email</span>
            <span class="detail-value">${escapeAdminHTML(apt.email || '-')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Date of Birth</span>
            <span class="detail-value">${escapeAdminHTML(apt.dob || '-')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Gender</span>
            <span class="detail-value">${escapeAdminHTML(apt.gender || '-')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Service</span>
            <span class="detail-value">${escapeAdminHTML(apt.serviceName || apt.service || '-')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Preferred Date</span>
            <span class="detail-value">${escapeAdminHTML(apt.preferredDate || '-')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Preferred Time</span>
            <span class="detail-value">${escapeAdminHTML(apt.preferredTime || '-')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value"><span class="status-badge ${escapeAdminHTML(apt.status || 'pending')}">${escapeAdminHTML(formatStatus(apt.status || 'pending'))}</span></span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Symptoms</span>
            <span class="detail-value">${escapeAdminHTML(apt.symptoms || '-')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">New Patient</span>
            <span class="detail-value">${escapeAdminHTML(apt.isNewPatient ? 'Yes' : 'No')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Created</span>
            <span class="detail-value">${createdAt}</span>
        </div>
        <div style="margin-top: 20px;">
            <div class="notes-title">Notes</div>
            ${notesHtml}
        </div>
    `;

    openModal('viewModal');
}

// Open note modal
function openNoteModal(id) {
    const apt = allAppointments.find(a => a.id === id);
    if (!apt) return;

    document.getElementById('noteAppointmentId').value = id;
    document.getElementById('noteText').value = '';

    const existingNotesDiv = document.getElementById('existingNotes');
    if (apt.notes && apt.notes.length > 0) {
        existingNotesDiv.innerHTML = `
            <div class="notes-title">Previous Notes</div>
            ${apt.notes.map(n => `
                <div class="note-item">
                    <div class="note-text">${escapeAdminHTML(n.text)}</div>
                    <div class="note-date">${escapeAdminHTML(n.date)}</div>
                </div>
            `).join('')}
        `;
    } else {
        existingNotesDiv.innerHTML = '';
    }

    openModal('noteModal');
}

// Save note
async function saveNote() {
    const id = document.getElementById('noteAppointmentId').value;
    const text = document.getElementById('noteText').value.trim();

    if (!text) {
        showToast('Please enter a note', 'error');
        return;
    }

    const apt = allAppointments.find(a => a.id === id);
    const notes = apt.notes || [];
    
    notes.push({
        text: text,
        date: new Date().toLocaleString()
    });

    try {
        await db.collection('appointments').doc(id).update({
            notes: notes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal('noteModal');
        showToast('Note added successfully', 'success');
    } catch (error) {
        console.error('Error adding note:', error);
        showToast('Error adding note', 'error');
    }
}

// Open delete modal
function openDeleteModal(id) {
    document.getElementById('deleteAppointmentId').value = id;
    openModal('deleteModal');
}

// Confirm delete
async function confirmDelete() {
    const id = document.getElementById('deleteAppointmentId').value;

    try {
        await db.collection('appointments').doc(id).delete();
        closeModal('deleteModal');
        showToast('Appointment deleted', 'success');
    } catch (error) {
        console.error('Error deleting:', error);
        showToast('Error deleting appointment', 'error');
    }
}

// Modal functions
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
    
    toast.className = 'toast ' + type;
    toastMessage.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Event listeners
statusFilter.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    renderAppointments();
});

searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderAppointments();
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    });
});

// Initialize
document.addEventListener('DOMContentLoaded', initAppointments);
