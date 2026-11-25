/* ========================================
   User Management Module - Real-time
   ======================================== */

// DOM Elements
const usersTableBody = document.getElementById('usersTableBody');
const emptyState = document.getElementById('emptyState');
const totalUsersEl = document.getElementById('totalUsers');
const activeUsersEl = document.getElementById('activeUsers');
const searchInput = document.getElementById('searchInput');
const addUserBtn = document.getElementById('addUserBtn');
const userModal = document.getElementById('userModal');
const deleteModal = document.getElementById('deleteModal');
const userForm = document.getElementById('userForm');
const saveUserBtn = document.getElementById('saveUserBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const modalTitle = document.getElementById('modalTitle');
const passwordGroup = document.getElementById('passwordGroup');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// Store users data
let usersData = [];

/* ========================================
   MODULE CONFIGURATION
   ========================================
   When adding new modules:
   1. Add module name to allModules array
   2. Add icon mapping in moduleIcons
   3. Add permission card in users.html modal
   4. Update modulePageMap in admin.js
   ======================================== */
const allModules = ['dashboard', 'appointments', 'lab-orders', 'pharmacy', 'bloodline', 'wellness', 'messages', 'callbacks', 'users', 'settings'];

// Module icons mapping (add new modules here too)
const moduleIcons = {
    'dashboard': 'fa-th-large',
    'appointments': 'fa-calendar-check',
    'lab-orders': 'fa-flask',
    'pharmacy': 'fa-prescription-bottle-medical',
    'bloodline': 'fa-dna',
    'wellness': 'fa-heart-pulse',
    'messages': 'fa-envelope',
    'callbacks': 'fa-phone-alt',
    'users': 'fa-users',
    'settings': 'fa-cog'
    // Add new modules: 'module-name': 'fa-icon-name'
};

// Department labels mapping
const departmentLabels = {
    'administration': 'Administration',
    'reception': 'Reception',
    'doctors': 'Doctors',
    'nursing': 'Nursing',
    'pharmacy': 'Pharmacy',
    'laboratory': 'Laboratory',
    'radiology': 'Radiology / Imaging',
    'dentistry': 'Dentistry',
    'physiotherapy': 'Physiotherapy',
    'emergency': 'Emergency',
    'surgery': 'Surgery',
    'maternity': 'Maternity',
    'pediatrics': 'Pediatrics',
    'outpatient': 'Outpatient (OPD)',
    'inpatient': 'Inpatient (IPD)',
    'records': 'Medical Records',
    'billing': 'Billing / Finance',
    'it': 'IT / Technical',
    'housekeeping': 'Housekeeping',
    'security': 'Security'
};

// Department icons mapping
const departmentIcons = {
    'administration': 'fa-building',
    'reception': 'fa-concierge-bell',
    'doctors': 'fa-user-md',
    'nursing': 'fa-user-nurse',
    'pharmacy': 'fa-pills',
    'laboratory': 'fa-flask',
    'radiology': 'fa-x-ray',
    'dentistry': 'fa-tooth',
    'physiotherapy': 'fa-dumbbell',
    'emergency': 'fa-ambulance',
    'surgery': 'fa-procedures',
    'maternity': 'fa-baby',
    'pediatrics': 'fa-child',
    'outpatient': 'fa-hospital-user',
    'inpatient': 'fa-bed',
    'records': 'fa-folder-open',
    'billing': 'fa-file-invoice-dollar',
    'it': 'fa-laptop-code',
    'housekeeping': 'fa-broom',
    'security': 'fa-shield-alt'
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupRealtimeUsers();
    setupEventListeners();
    syncExistingAuthUsers();
});

// Setup Event Listeners
function setupEventListeners() {
    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => openModal());
    }

    if (saveUserBtn) {
        saveUserBtn.addEventListener('click', saveUser);
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteUser);
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterUsers(e.target.value));
    }

    if (userModal) {
        userModal.addEventListener('click', (e) => {
            if (e.target === userModal) closeModal();
        });
    }

    if (deleteModal) {
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) closeDeleteModal();
        });
    }
}

// Sync existing Firebase Auth users to Firestore
async function syncExistingAuthUsers() {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) return;

    try {
        const userDoc = await db.collection('admin_users').doc(currentUser.uid).get();
        if (!userDoc.exists) {
            const token = await currentUser.getIdTokenResult();
            if (token.claims.admin !== true) return;
            // Only a trusted administrator may bootstrap their staff record.
            const defaultPermissions = {};
            allModules.forEach(m => {
                defaultPermissions[m] = { view: true, edit: true, delete: true };
            });

            await db.collection('admin_users').doc(currentUser.uid).set({
                uid: currentUser.uid,
                name: currentUser.displayName || 'Admin',
                email: currentUser.email,
                role: 'admin',
                department: 'administration',
                status: 'active',
                modules: allModules,
                permissions: defaultPermissions,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Synced existing user to admin_users collection');
        }
    } catch (error) {
        console.error('Error syncing auth user:', error);
    }
}

// Setup Real-time Users Listener
function setupRealtimeUsers() {
    if (typeof db === 'undefined') {
        console.error('Firebase not initialized');
        return;
    }

    db.collection('admin_users').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        usersData = [];
        let activeCount = 0;

        snapshot.forEach(doc => {
            const user = { id: doc.id, ...doc.data() };
            usersData.push(user);
            if (user.status === 'active') activeCount++;
        });

        if (totalUsersEl) totalUsersEl.textContent = usersData.length;
        if (activeUsersEl) activeUsersEl.textContent = activeCount;

        renderUsersTable(usersData);
    }, (error) => {
        console.error('Error fetching users:', error);
        showToast('Error loading users', true);
    });
}

// Render Users Table
function renderUsersTable(users) {
    if (!usersTableBody) return;

    if (users.length === 0) {
        usersTableBody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        document.querySelector('.table-responsive').style.display = 'none';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    document.querySelector('.table-responsive').style.display = 'block';

    usersTableBody.innerHTML = users.map(user => {
        const initials = getInitials(user.name || 'U');
        const deptLabel = departmentLabels[user.department] || user.department || 'N/A';
        const deptIcon = departmentIcons[user.department] || 'fa-building';

        return `
            <tr data-id="${escapeAdminHTML(user.id)}">
                <td>
                    <div class="user-info">
                        <div class="user-avatar">${escapeAdminHTML(initials)}</div>
                        <span>${escapeHtml(user.name || 'Unknown')}</span>
                    </div>
                </td>
                <td>${escapeHtml(user.email || '')}</td>
                <td>
                    <span class="dept-badge">
                        <i class="fas ${deptIcon}"></i>
                        ${deptLabel}
                    </span>
                </td>
                <td><span class="role-badge ${escapeAdminHTML(user.role || 'staff')}">${escapeAdminHTML(user.role || 'staff')}</span></td>
                <td>
                    <span class="status-badge ${escapeAdminHTML(user.status || 'active')}">${escapeAdminHTML(user.status || 'active')}</span>
                </td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn edit" onclick="editUser('${escapeAdminJSArgument(user.id)}')" title="Edit">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="action-btn delete" onclick="openDeleteModal('${escapeAdminJSArgument(user.id)}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Filter Users
function filterUsers(query) {
    const q = query.toLowerCase();
    const filtered = usersData.filter(user => 
        (user.name || '').toLowerCase().includes(q) ||
        (user.email || '').toLowerCase().includes(q) ||
        (user.role || '').toLowerCase().includes(q) ||
        (user.department || '').toLowerCase().includes(q) ||
        (departmentLabels[user.department] || '').toLowerCase().includes(q)
    );
    renderUsersTable(filtered);
}

// Open Modal (Add/Edit)
function openModal(userId = null) {
    if (!userModal) return;

    // Reset form
    userForm.reset();
    document.getElementById('userId').value = '';
    
    // Reset all permission checkboxes
    document.querySelectorAll('.permissions-table input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });

    if (userId) {
        // Edit mode
        const user = usersData.find(u => u.id === userId);
        if (!user) return;

        modalTitle.textContent = 'Edit User';
        document.getElementById('userId').value = userId;
        document.getElementById('userName').value = user.name || '';
        document.getElementById('userEmail').value = user.email || '';
        document.getElementById('userEmail').readOnly = true;
        document.getElementById('userRole').value = user.role || 'staff';
        document.getElementById('userDepartment').value = user.department || '';
        document.getElementById('userStatus').checked = user.status === 'active';
        
        // Set permissions
        const permissions = user.permissions || {};
        allModules.forEach(module => {
            const perm = permissions[module] || {};
            const viewCb = document.querySelector(`input[name="perm_${module}_view"]`);
            const editCb = document.querySelector(`input[name="perm_${module}_edit"]`);
            const deleteCb = document.querySelector(`input[name="perm_${module}_delete"]`);
            
            if (viewCb && !viewCb.disabled) viewCb.checked = !!perm.view;
            if (editCb && !editCb.disabled) editCb.checked = !!perm.edit;
            if (deleteCb && !deleteCb.disabled) deleteCb.checked = !!perm.delete;
        });

        // Hide password field for edit
        passwordGroup.style.display = 'none';
    } else {
        // Add mode
        modalTitle.textContent = 'Add New User';
        document.getElementById('userEmail').readOnly = false;
        passwordGroup.style.display = 'block';
    }

    userModal.classList.add('active');
}

// Close Modal
function closeModal() {
    if (userModal) userModal.classList.remove('active');
}

// Open Delete Modal
function openDeleteModal(userId) {
    document.getElementById('deleteUserId').value = userId;
    if (deleteModal) deleteModal.classList.add('active');
}

// Close Delete Modal
function closeDeleteModal() {
    if (deleteModal) deleteModal.classList.remove('active');
}

// Get Permissions from Form
function getPermissionsFromForm() {
    const permissions = {};
    const modules = [];

    allModules.forEach(module => {
        const viewCb = document.querySelector(`input[name="perm_${module}_view"]`);
        const editCb = document.querySelector(`input[name="perm_${module}_edit"]`);
        const deleteCb = document.querySelector(`input[name="perm_${module}_delete"]`);

        const hasView = viewCb && !viewCb.disabled && viewCb.checked;
        const hasEdit = editCb && !editCb.disabled && editCb.checked;
        const hasDelete = deleteCb && !deleteCb.disabled && deleteCb.checked;

        if (hasView || hasEdit || hasDelete) {
            modules.push(module);
            permissions[module] = {
                view: hasView,
                edit: hasEdit,
                delete: hasDelete
            };
        }
    });

    return { modules, permissions };
}

// Save User
async function saveUser() {
    const userId = document.getElementById('userId').value;
    const name = document.getElementById('userName').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('userRole').value;
    const department = document.getElementById('userDepartment').value;
    const status = document.getElementById('userStatus').checked ? 'active' : 'inactive';
    
    // Get permissions
    const { modules, permissions } = getPermissionsFromForm();

    // Validation
    if (!name || !email || !role || !department) {
        showToast('Please fill in all required fields', true);
        return;
    }

    if (modules.length === 0) {
        showToast('Please grant at least one permission', true);
        return;
    }

    if (!userId && (!password || password.length < 6)) {
        showToast('Password must be at least 6 characters', true);
        return;
    }

    saveUserBtn.disabled = true;
    saveUserBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        const userData = {
            name,
            email: email.toLowerCase(),
            role,
            department,
            status,
            modules,
            permissions,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (userId) {
            // Update existing user
            await db.collection('admin_users').doc(userId).update(userData);
            showToast('User updated successfully');
        } else {
            // Create the login on a separate, memory-only Firebase app. Creating it on the
            // main app would sign the admin out and sign the new person in, so the staff
            // record below would be written as them and refused by the security rules,
            // leaving a login with no staff record (they could never reach the dashboard).
            const creator = firebase.apps.find(app => app.name === 'staff-creator') ||
                firebase.initializeApp(firebaseConfig, 'staff-creator');
            const creatorAuth = creator.auth();
            await creatorAuth.setPersistence(firebase.auth.Auth.Persistence.NONE);
            const userCredential = await creatorAuth.createUserWithEmailAndPassword(email, password);
            const newUid = userCredential.user.uid;

            userData.uid = newUid;
            userData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            try {
                // Written by the signed-in admin, as the rules require
                await db.collection('admin_users').doc(newUid).set(userData);
            } catch (writeError) {
                // Don't leave a login without a staff record behind; remove it so saving again works
                try { await userCredential.user.delete(); } catch (_) { /* best effort */ }
                writeError.staffRecordFailed = true;
                throw writeError;
            } finally {
                await creatorAuth.signOut().catch(() => {});
            }
            showToast(`${name} can now sign in with ${email.toLowerCase()}`);
        }

        closeModal();
    } catch (error) {
        console.error('Error saving user:', error);
        let errorMsg = 'Error saving user';
        if (error.staffRecordFailed) {
            errorMsg = error.code === 'permission-denied'
                ? 'Only an admin can add staff accounts'
                : 'Could not save the staff record. Check your connection and try again.';
        } else if (error.code === 'permission-denied') {
            errorMsg = 'Only an admin can add or change staff accounts';
        } else if (error.code === 'auth/email-already-in-use') {
            errorMsg = 'Email already in use';
        } else if (error.code === 'auth/weak-password') {
            errorMsg = 'Password is too weak';
        } else if (error.code === 'auth/invalid-email') {
            errorMsg = 'Invalid email address';
        }
        showToast(errorMsg, true);
    } finally {
        saveUserBtn.disabled = false;
        saveUserBtn.innerHTML = 'Save User';
    }
}

// Delete User
async function deleteUser() {
    const userId = document.getElementById('deleteUserId').value;
    if (!userId) return;

    // Prevent deleting self
    const currentUser = firebase.auth().currentUser;
    if (currentUser && currentUser.uid === userId) {
        showToast('Cannot delete your own account', true);
        closeDeleteModal();
        return;
    }

    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

    try {
        await db.collection('admin_users').doc(userId).delete();
        showToast('User deleted successfully');
        closeDeleteModal();
    } catch (error) {
        console.error('Error deleting user:', error);
        showToast('Error deleting user', true);
    } finally {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.innerHTML = 'Delete';
    }
}

// Edit User
function editUser(userId) {
    openModal(userId);
}

// Show Toast
function showToast(message, isError = false) {
    if (!toast || !toastMessage) return;
    
    toastMessage.textContent = message;
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.querySelector('i').className = isError ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Helper: Get Initials
function getInitials(name) {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

// Helper: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// Helper: Format Module Name
function formatModuleName(name) {
    return name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
