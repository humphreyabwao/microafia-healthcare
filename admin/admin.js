/* ========================================
   Admin Dashboard JavaScript
   ======================================== */

// Current user data and permissions
let currentUserData = null;
let userPermissions = {};

/* ========================================
   MODULE CONFIGURATION
   ========================================
   To add a new module:
   1. Add entry here: 'module-name': 'page.html'
   2. Create the page with loading overlay
   3. Add nav-item in sidebar (all admin pages)
   4. Add permission card in users.html modal
   5. Add to allModules array in users.js
   ======================================== */
const ADMIN_BASE = '/admin/';

const modulePageMap = {
    'dashboard': 'index.html',
    'appointments': 'appointments.html',
    'lab-orders': 'lab-orders.html',
    'pharmacy': 'pharmacy.html',
    'bloodline': 'bloodline.html',
    'wellness': 'wellness.html',
    'messages': 'messages.html',
    'callbacks': 'callbacks.html',
    'users': 'users.html',
    'settings': 'settings.html'
    // Add new modules here: 'module-name': 'page.html'
};

// Clean URLs (/admin, /admin/appointments): the hosts redirect /admin/ and *.html,
// so linking to them directly would cost an extra round trip on every navigation.
function toAdminPath(page) {
    if (!page || page === 'index.html') return '/admin';
    if (page.startsWith('/')) return page;
    return ADMIN_BASE + page.replace(/\.html$/, '');
}

function normalizePath(path) {
    if (!path) return '/';
    let p = path;
    if (!p.startsWith('/')) p = `/${p}`;
    if (p.endsWith('/')) p = p.slice(0, -1);
    if (p.endsWith('.html')) p = p.slice(0, -5);
    if (p === '/admin/index') p = '/admin';
    return p;
}

function currentAdminPage() {
    const path = normalizePath(window.location.pathname);
    if (path === '/admin') return 'index.html';
    return `${path.split('/').pop()}.html`;
}

// ---------- Fast start ----------
// 1. Keep a local copy of Firestore data so every module opens instantly from
//    cache and then syncs live. Cleared again on logout (see logout()).
// 2. Remember the staff profile for this browser tab, but wait for a bounded
//    server permission check before showing the protected page.
//    Data access is always enforced by Firestore security rules.
const PROFILE_CACHE_KEY = 'mf_admin_profile';
try {
    db.enablePersistence({ synchronizeTabs: true }).catch(err => {
        if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') console.warn('Offline cache unavailable:', err.code);
    });
} catch (_) { /* persistence already configured */ }

function readCachedProfile() {
    try { return JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY) || 'null'); } catch (_) { return null; }
}

function writeCachedProfile(data) {
    try {
        const { id, name, firstName, role, status, modules, permissions } = data;
        sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id, name, firstName, role, status, modules, permissions }));
    } catch (_) { /* storage full or blocked */ }
}

function applyProfile(data) {
    currentUserData = data;
    userPermissions = data.permissions || {};
    applyRoleBasedAccess(data);
    applyActionPermissions();
    const profileName = document.querySelector('.profile-name');
    if (profileName) profileName.textContent = data.name || 'Admin';
    startNotificationsWhenReady();
}

// Staff check. The login page verifies the staff record and stores the profile for
// this tab, so the page opens instantly from that copy; the record is re-checked
// with the server in the background and the session ends if access was removed.
// Firestore security rules protect the data either way: the cached profile only
// decides which menu items show.
const LOGIN_NOTICE_KEY = 'mf_login_notice';
const STAFF_CHECK_TIMEOUT = 8000;

async function fetchStaffProfile(uid) {
    let timer;
    try {
        return await Promise.race([
            db.collection('admin_users').doc(uid).get({ source: 'server' }),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(Object.assign(new Error('Staff access check timed out'), { code: 'timeout' })), STAFF_CHECK_TIMEOUT);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

// End the session and explain why on the login page (never a silent bounce).
async function denyAccess(message) {
    try {
        sessionStorage.removeItem(PROFILE_CACHE_KEY);
        sessionStorage.setItem(LOGIN_NOTICE_KEY, message);
    } catch (_) { /* ignore */ }
    try { await firebase.auth().signOut(); } catch (_) { /* ignore */ }
    window.location.replace(toAdminPath('login.html'));
}

const NO_STAFF_RECORD = 'This account is not set up for the staff dashboard. Ask an administrator to add you in User Management.';
const INACTIVE_ACCOUNT = 'Your staff account is inactive. Please contact an administrator.';

function showAccessError(error) {
    const overlay = document.getElementById('permissionsLoading');
    if (!overlay) return;
    const denied = error.code === 'permission-denied';
    overlay.classList.remove('hidden');
    overlay.setAttribute('role', 'alert');
    overlay.innerHTML = `<div class="permissions-error">
        <h1>Unable to load staff access</h1>
        <p>${denied
            ? 'Your staff permissions could not be verified. Ask an administrator to check your staff account and database access.'
            : 'The access check could not finish. Check your connection and try again.'}</p>
        <div><button type="button" id="retryStaffAccess">Try again</button>
        <button type="button" id="signOutStaffAccess">Sign out</button></div>
    </div>`;
    document.getElementById('retryStaffAccess').addEventListener('click', () => window.location.reload());
    document.getElementById('signOutStaffAccess').addEventListener('click', logout);
}

// Returns the verified profile, or null after handling a refusal.
async function verifyStaff(user) {
    const userDoc = await fetchStaffProfile(user.uid);
    if (userDoc.exists) {
        const profile = { id: userDoc.id, ...userDoc.data() };
        if (profile.status !== 'active') { await denyAccess(INACTIVE_ACCOUNT); return null; }
        writeCachedProfile(profile);
        return profile;
    }
    // First-time bootstrap requires an admin claim set by a trusted server.
    const token = await user.getIdTokenResult();
    if (token.claims.admin !== true) { await denyAccess(NO_STAFF_RECORD); return null; }
    const defaultPermissions = {};
    Object.keys(modulePageMap).forEach(m => { defaultPermissions[m] = { view: true, edit: true, delete: true }; });
    const profile = {
        uid: user.uid,
        name: user.displayName || 'Admin',
        email: user.email,
        role: 'admin',
        status: 'active',
        modules: Object.keys(modulePageMap),
        permissions: defaultPermissions
    };
    await db.collection('admin_users').doc(user.uid).set({
        ...profile,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const saved = { id: user.uid, ...profile };
    writeCachedProfile(saved);
    return saved;
}

const accessKey = p => JSON.stringify([p.role, p.status, p.modules || [], p.permissions || {}]);

// Auth Check - Redirect to login if not authenticated
firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
        try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch (_) { /* ignore */ }
        window.location.replace(toAdminPath('login.html'));
        return;
    }

    let cached = readCachedProfile();
    if (cached && (cached.id !== user.uid || cached.status !== 'active')) {
        try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch (_) { /* ignore */ }
        // The shell was drawn early for a different account: start clean
        if (earlyProfile) { window.location.reload(); return; }
        cached = null;
    }

    if (cached) {
        // Instant: the page is already showing (see earlyProfile); confirm in the background.
        if (!earlyProfile) applyProfile(cached);
        try {
            const fresh = await verifyStaff(user);
            if (!fresh) return;
            if (accessKey(fresh) !== accessKey(cached)) window.location.reload();   // access changed: redraw menus
            else currentUserData = fresh;
        } catch (error) {
            // Offline or slow: keep working; Firestore rules still guard every read and write.
            if (error.code === 'permission-denied') await denyAccess('Your staff access could not be verified. Please sign in again.');
            else console.warn('Background staff check failed:', error.code || error.message);
        }
        return;
    }

    try {
        const profile = await verifyStaff(user);
        if (profile) applyProfile(profile);
    } catch (error) {
        console.error('Error fetching user data:', error);
        try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch (_) { /* ignore */ }
        // Stay here: login redirects signed-in users back and would cause a loop.
        showAccessError(error);
    }
});

// Apply Role-Based Access Control
function applyRoleBasedAccess(userData) {
    if (!userData) {
        window.location.href = toAdminPath('login.html');
        return;
    }

    const currentPage = currentAdminPage();
    const currentPath = window.location.pathname;
    const normalizedPath = normalizePath(currentPath);
    // Admins always see every module (so newly added modules like Pharmacy
    // work without editing each admin's saved module list).
    const allowedModules = ['admin', 'super_admin'].includes(userData.role)
        ? Object.keys(modulePageMap)
        : (Array.isArray(userData.modules) ? userData.modules : []);
    
    // Check if current page is allowed
    let isPageAllowed = false;
    for (const [module, page] of Object.entries(modulePageMap)) {
        const pagePath = toAdminPath(page);
        if ((page === currentPage || normalizePath(pagePath) === normalizedPath) && allowedModules.includes(module)) {
            isPageAllowed = true;
            break;
        }
    }
    
    // Profile page is always allowed
    if (currentPage === 'profile.html') {
        isPageAllowed = true;
    }
    
    // Redirect if not allowed
    if (!isPageAllowed && currentPage !== 'login.html') {
        // Redirect to first allowed module
        for (const module of allowedModules) {
            if (modulePageMap[module]) {
                window.location.href = toAdminPath(modulePageMap[module]);
                return;
            }
        }
        // If no modules allowed, go to profile
        window.location.href = toAdminPath('profile.html');
        return;
    }
    
    // Hide nav items for modules user doesn't have access to
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(item => {
        const link = item.querySelector('.nav-link');
        if (!link) return;

        const href = link.getAttribute('href');
        const linkPath = href ? new URL(href, window.location.origin).pathname : '';
        const normalizedLink = normalizePath(linkPath);
        
        for (const [module, page] of Object.entries(modulePageMap)) {
            const pagePath = toAdminPath(page);
            const normalizedPage = normalizePath(pagePath);
            if (normalizedLink === normalizedPage || href === page) {
                // Set data attribute for the module
                item.setAttribute('data-module', module);
                
                // Add 'allowed' class if user has access
                if (allowedModules.includes(module)) {
                    item.classList.add('allowed');
                }
                break;
            }
        }
    });
    
    // Mark permissions as loaded - this triggers CSS visibility
    document.body.classList.add('permissions-loaded');
    
    // Hide loading overlay
    hideLoadingOverlay();
}

// Hide loading overlay
function hideLoadingOverlay() {
    const overlay = document.getElementById('permissionsLoading');
    if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => overlay.remove(), 300);
    }
}

// Apply Action-Based Permissions (Edit/Delete buttons)
function applyActionPermissions() {
    const currentPage = currentAdminPage();
    
    // Find which module we're on
    let currentModule = null;
    for (const [module, page] of Object.entries(modulePageMap)) {
        if (page === currentPage) {
            currentModule = module;
            break;
        }
    }
    
    if (!currentModule || !userPermissions[currentModule]) return;
    
    const perms = userPermissions[currentModule];
    
    // Hide edit buttons if no edit permission
    if (!perms.edit) {
        document.querySelectorAll('.action-btn.edit, .btn-edit, [data-action="edit"]').forEach(btn => {
            btn.style.display = 'none';
        });
        // Also hide add buttons
        document.querySelectorAll('#addUserBtn, .btn-add, [data-action="add"]').forEach(btn => {
            btn.style.display = 'none';
        });
    }
    
    // Hide delete buttons if no delete permission
    if (!perms.delete) {
        document.querySelectorAll('.action-btn.delete, .btn-delete, [data-action="delete"]').forEach(btn => {
            btn.style.display = 'none';
        });
    }
}

// Check if user has permission for action
function hasPermission(module, action) {
    if (!userPermissions[module]) return false;
    return !!userPermissions[module][action];
}

// Get current user permissions (for use in other modules)
function getCurrentUserPermissions() {
    return userPermissions;
}

// Get current user data
function getCurrentUserData() {
    return currentUserData;
}

// DOM Elements
const sidebar = document.getElementById('sidebar');
const mainWrapper = document.getElementById('mainWrapper');
const sidebarToggle = document.getElementById('sidebarToggle');
const profileBtn = document.getElementById('profileBtn');
const profileMenu = document.getElementById('profileMenu');
const logoutBtn = document.getElementById('logoutBtn');
const notifCount = document.getElementById('notifCount');

// Toggle Sidebar
function toggleSidebar() {
    if (window.innerWidth <= 992) {
        sidebar.classList.toggle('active');
        document.body.classList.toggle('sidebar-open');
    } else {
        sidebar.classList.toggle('collapsed');
        mainWrapper.classList.toggle('expanded');
    }
}

if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebar);
}

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 992 && sidebar.classList.contains('active')) {
        if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
            sidebar.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        }
    }
});

// Profile Dropdown
if (profileBtn) {
    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileMenu.classList.toggle('active');
    });
}

document.addEventListener('click', () => {
    if (profileMenu) profileMenu.classList.remove('active');
});

// Handle window resize
window.addEventListener('resize', () => {
    if (window.innerWidth > 992) {
        sidebar.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    }
});

// ========================================
// Refresh Button
// ========================================
const refreshBtn = document.getElementById('refreshBtn');
const syncMsg = document.getElementById('syncMsg');
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        refreshBtn.classList.add('spinning');
        if (syncMsg) syncMsg.classList.add('show');
        setTimeout(() => location.reload(), 500);
    });
}

// ========================================
// Real-time Dashboard Stats & Data
// ========================================

function setupDashboardRealtime() {
    if (typeof db === 'undefined') {
        console.error('Firebase not initialized');
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Stats counters
    let stats = {
        appointments: { total: 0, today: 0 },
        labOrders: { total: 0, today: 0 },
        wellness: { total: 0, today: 0 },
        messages: { total: 0, unread: 0 },
        callbacks: { total: 0, pending: 0 }
    };

    // Real-time listener for Appointments
    db.collection('appointments').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        stats.appointments.total = snapshot.size;
        stats.appointments.today = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.createdAt && data.createdAt.toDate() >= today) {
                stats.appointments.today++;
            }
        });
        
        updateStatsDisplay('appointmentsCount', stats.appointments.today);
        updateRecentAppointments(snapshot);
        updateNotificationBadge();
    });

    // Real-time listener for Lab Orders
    db.collection('lab_orders').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        stats.labOrders.total = snapshot.size;
        stats.labOrders.today = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.createdAt && data.createdAt.toDate() >= today) {
                stats.labOrders.today++;
            }
        });
        
        updateStatsDisplay('labOrdersCount', stats.labOrders.today);
        updateRecentLabOrders(snapshot);
        updateNotificationBadge();
    });

    // Real-time listener for Wellness Bookings
    db.collection('wellness_bookings').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        stats.wellness.total = snapshot.size;
        stats.wellness.today = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.createdAt && data.createdAt.toDate() >= today) {
                stats.wellness.today++;
            }
        });
        
        updateStatsDisplay('wellnessCount', stats.wellness.today);
        updateRecentWellness(snapshot);
        updateNotificationBadge();
    });

    // Real-time listener for Messages
    db.collection('contact_messages').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        stats.messages.total = snapshot.size;
        stats.messages.unread = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'unread' || !data.status) {
                stats.messages.unread++;
            }
        });
        
        updateStatsDisplay('messagesCount', stats.messages.unread);
        updateRecentMessages(snapshot);
        updateNotificationBadge();
    });

    // Real-time listener for Callback Requests
    db.collection('callback_requests').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        stats.callbacks.total = snapshot.size;
        stats.callbacks.pending = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'pending' || !data.status) {
                stats.callbacks.pending++;
            }
        });
        
        updateNotificationBadge();
    });

    function updateNotificationBadge() {
        const totalToday = stats.appointments.today + stats.labOrders.today + stats.wellness.today + stats.messages.unread + stats.callbacks.pending;
        if (notifCount) {
            notifCount.textContent = totalToday > 99 ? '99+' : totalToday;
            notifCount.style.display = totalToday > 0 ? 'flex' : 'none';
        }
    }
}

function updateStatsDisplay(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = value;
        // Add animation
        el.classList.add('updated');
        setTimeout(() => el.classList.remove('updated'), 500);
    }
}

// Update Recent Appointments Table
function updateRecentAppointments(snapshot) {
    const tbody = document.getElementById('recentAppointments');
    if (!tbody) return;

    if (snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><i class="fas fa-calendar-alt"></i><p>No appointments yet</p></td></tr>';
        return;
    }

    let html = '';
    let count = 0;
    snapshot.forEach(doc => {
        if (count >= 5) return;
        const data = doc.data();
        const status = data.status || 'pending';
        const name = data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : (data.name || 'N/A');
        const service = data.serviceName || data.service || 'N/A';
        const date = data.preferredDate || data.date || 'N/A';
        
        html += `
            <tr>
                <td>${escapeAdminHTML(name)}</td>
                <td>${escapeAdminHTML(service)}</td>
                <td>${escapeAdminHTML(date)}</td>
                <td><span class="status-badge ${escapeAdminHTML(status)}">${escapeAdminHTML(status)}</span></td>
            </tr>
        `;
        count++;
    });
    tbody.innerHTML = html;
}

// Update Recent Lab Orders Table
function updateRecentLabOrders(snapshot) {
    const tbody = document.getElementById('recentLabOrders');
    if (!tbody) return;

    if (snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><i class="fas fa-flask"></i><p>No lab orders yet</p></td></tr>';
        return;
    }

    let html = '';
    let count = 0;
    snapshot.forEach(doc => {
        if (count >= 5) return;
        const data = doc.data();
        const status = data.status || 'pending';
        const name = data.customerName || data.name || 'N/A';
        const tests = data.tests ? data.tests.map(t => t.name || t).join(', ') : 'N/A';
        const testsDisplay = tests.length > 25 ? tests.substring(0, 25) + '...' : tests;
        const total = data.total || 0;
        
        html += `
            <tr>
                <td>${escapeAdminHTML(name)}</td>
                <td>${escapeAdminHTML(testsDisplay)}</td>
                <td>KSh ${total.toLocaleString()}</td>
                <td><span class="status-badge ${escapeAdminHTML(status)}">${escapeAdminHTML(status)}</span></td>
            </tr>
        `;
        count++;
    });
    tbody.innerHTML = html;
}

// Update Recent Wellness Table
function updateRecentWellness(snapshot) {
    const tbody = document.getElementById('recentWellness');
    if (!tbody) return;

    if (snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><i class="fas fa-heart-pulse"></i><p>No wellness bookings yet</p></td></tr>';
        return;
    }

    let html = '';
    let count = 0;
    snapshot.forEach(doc => {
        if (count >= 5) return;
        const data = doc.data();
        const status = data.status || 'pending';
        const name = data.fullName || data.name || 'N/A';
        const pkg = data.packageName || data.package || 'N/A';
        const date = data.preferredDate || data.date || 'N/A';
        
        html += `
            <tr>
                <td>${escapeAdminHTML(name)}</td>
                <td>${escapeAdminHTML(pkg)}</td>
                <td>${escapeAdminHTML(date)}</td>
                <td><span class="status-badge ${escapeAdminHTML(status)}">${escapeAdminHTML(status)}</span></td>
            </tr>
        `;
        count++;
    });
    tbody.innerHTML = html;
}

// Update Recent Messages
function updateRecentMessages(snapshot) {
    const container = document.getElementById('recentMessages');
    if (!container) return;

    if (snapshot.empty) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-envelope"></i><p>No messages yet</p></div>';
        return;
    }

    let html = '';
    let count = 0;
    snapshot.forEach(doc => {
        if (count >= 5) return;
        const data = doc.data();
        const name = data.name || 'Unknown';
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const time = data.createdAt ? formatTimeAgo(data.createdAt.toDate()) : '';
        const message = data.message || 'No message';
        const msgPreview = message.length > 50 ? message.substring(0, 50) + '...' : message;
        const isUnread = data.status === 'unread' || !data.status;
        
        html += `
            <div class="message-item ${isUnread ? 'unread' : ''}">
                <div class="message-avatar">${escapeAdminHTML(initials)}</div>
                <div class="message-content">
                    <div class="message-name">${escapeAdminHTML(name)}</div>
                    <div class="message-text">${escapeAdminHTML(msgPreview)}</div>
                    <div class="message-time">${time}</div>
                </div>
            </div>
        `;
        count++;
    });
    container.innerHTML = html;
}

// Format time ago
function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + ' days ago';
    
    return date.toLocaleDateString();
}

// ========================================
// Notification Panel System
// ========================================

let allNotifications = [];
let currentNotifTab = 'all';

function initNotificationPanel() {
    const notifBtn = document.getElementById('notifBtn');
    const notificationPanel = document.getElementById('notificationPanel');
    const notifTabs = document.querySelectorAll('.notif-tab');
    const markAllReadBtn = document.getElementById('markAllRead');

    if (!notifBtn || !notificationPanel) return;

    // Toggle notification panel
    notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notificationPanel.classList.toggle('active');
        if (profileMenu) profileMenu.classList.remove('active');
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!notificationPanel.contains(e.target) && !notifBtn.contains(e.target)) {
            notificationPanel.classList.remove('active');
        }
    });

    // Tab switching
    notifTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            notifTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentNotifTab = tab.dataset.tab;
            renderNotifications();
        });
    });

    // Mark all as read
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', () => {
            markAllNotificationsRead();
        });
    }

}

// Notification listeners start only after the staff check (no queries before access is known).
let notificationsStarted = false;
function startNotificationsWhenReady() {
    if (notificationsStarted || !currentUserData || !document.getElementById('notifList')) {
        if (!notificationsStarted && currentUserData && document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startNotificationsWhenReady, { once: true });
        }
        return;
    }
    notificationsStarted = true;
    setupNotificationListeners();
}

// A module this staff member can't view simply contributes no notifications.
function notificationListenerError(error) {
    if (error.code !== 'permission-denied') console.warn('Notification feed unavailable:', error.code || error.message);
}

function setupNotificationListeners() {
    if (typeof db === 'undefined') return;

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    // Listen to recent appointments
    db.collection('appointments')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            updateNotificationsFromSnapshot(snapshot, 'appointment', 'New Appointment', doc => {
                const d = doc.data();
                const name = d.firstName && d.lastName ? `${d.firstName} ${d.lastName}` : (d.name || 'A patient');
                return `${name} booked an appointment for ${d.serviceName || d.service || 'consultation'}`;
            });
        }, notificationListenerError);

    // Listen to recent lab orders
    db.collection('lab_orders')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            updateNotificationsFromSnapshot(snapshot, 'lab', 'New Lab Order', doc => {
                const d = doc.data();
                const name = d.customerName || d.name || 'A customer';
                const testCount = d.tests ? d.tests.length : 0;
                return `${name} ordered ${testCount} test${testCount !== 1 ? 's' : ''}`;
            });
        }, notificationListenerError);

    // Listen to recent wellness bookings
    db.collection('wellness_bookings')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            updateNotificationsFromSnapshot(snapshot, 'wellness', 'New Wellness Booking', doc => {
                const d = doc.data();
                const name = d.fullName || d.name || 'A customer';
                return `${name} booked ${d.packageName || d.package || 'a wellness package'}`;
            });
        }, notificationListenerError);

    // Listen to recent messages
    db.collection('contact_messages')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            updateNotificationsFromSnapshot(snapshot, 'message', 'New Message', doc => {
                const d = doc.data();
                const name = d.name || 'Someone';
                const preview = d.message ? d.message.substring(0, 40) + '...' : '';
                return `${name}: ${preview}`;
            });
        }, notificationListenerError);

    // Listen to callback requests
    db.collection('callback_requests')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            updateNotificationsFromSnapshot(snapshot, 'callback', 'Callback Request', doc => {
                const d = doc.data();
                return `${d.name || 'Someone'} requested a callback at ${d.phone || 'N/A'}`;
            });
        }, notificationListenerError);

    // Listen to reminders
    db.collection('reminders')
        .orderBy('reminderDate', 'asc')
        .limit(10)
        .onSnapshot(snapshot => {
            // Remove old reminders from notifications
            allNotifications = allNotifications.filter(n => n.type !== 'reminder');
            
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.status !== 'completed') {
                    const reminderDate = d.reminderDate ? d.reminderDate.toDate() : new Date();
                    const isOverdue = reminderDate < new Date();
                    
                    allNotifications.push({
                        id: doc.id,
                        type: 'reminder',
                        title: isOverdue ? 'Overdue Reminder' : 'Upcoming Reminder',
                        text: d.title || d.message || 'Reminder',
                        time: reminderDate,
                        read: d.read || false,
                        isReminder: true,
                        isOverdue: isOverdue
                    });
                }
            });
            
            sortAndRenderNotifications();
        }, notificationListenerError);
}

function updateNotificationsFromSnapshot(snapshot, type, title, textFn) {
    // Remove old notifications of this type
    allNotifications = allNotifications.filter(n => n.type !== type);
    
    snapshot.forEach(doc => {
        const data = doc.data();
        const createdAt = data.createdAt ? data.createdAt.toDate() : new Date();
        
        allNotifications.push({
            id: doc.id,
            type: type,
            title: title,
            text: textFn(doc),
            time: createdAt,
            read: data.notificationRead || false,
            status: data.status
        });
    });
    
    sortAndRenderNotifications();
}

function sortAndRenderNotifications() {
    // Sort by time, newest first
    allNotifications.sort((a, b) => b.time - a.time);
    renderNotifications();
    updateNotificationBadgeFromList();
}

function renderNotifications() {
    const notifList = document.getElementById('notifList');
    if (!notifList) return;

    // Filter based on current tab
    let filtered = allNotifications;
    if (currentNotifTab === 'appointments') {
        filtered = allNotifications.filter(n => n.type === 'appointment');
    } else if (currentNotifTab === 'messages') {
        filtered = allNotifications.filter(n => n.type === 'message' || n.type === 'callback');
    } else if (currentNotifTab === 'reminders') {
        filtered = allNotifications.filter(n => n.type === 'reminder');
    }

    if (filtered.length === 0) {
        notifList.innerHTML = `
            <div class="notif-empty">
                <i class="fas fa-bell-slash"></i>
                <p>No notifications</p>
            </div>
        `;
        return;
    }

    let html = '';
    filtered.slice(0, 15).forEach(notif => {
        const iconClass = getNotifIconClass(notif.type);
        const icon = getNotifIcon(notif.type);
        const timeStr = formatTimeAgo(notif.time);
        
        html += `
            <div class="notif-item ${escapeAdminHTML(!notif.read ? 'unread' : '')}" data-id="${escapeAdminHTML(notif.id)}" data-type="${escapeAdminHTML(notif.type)}">
                <div class="notif-icon ${iconClass}">
                    <i class="${icon}"></i>
                </div>
                <div class="notif-content">
                    <div class="notif-title">${escapeAdminHTML(notif.title)}</div>
                    <div class="notif-text">${escapeAdminHTML(notif.text)}</div>
                    <div class="notif-time">${timeStr}</div>
                    ${notif.isReminder && notif.isOverdue ? '<span class="reminder-badge"><i class="fas fa-exclamation-triangle"></i> Overdue</span>' : ''}
                </div>
            </div>
        `;
    });

    notifList.innerHTML = html;

    // Add click handlers to mark as read and navigate
    notifList.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            const type = item.dataset.type;
            markNotificationRead(id, type);
            navigateToNotification(type);
        });
    });
}

function getNotifIconClass(type) {
    const classes = {
        appointment: 'appointment',
        lab: 'lab',
        wellness: 'wellness',
        message: 'message',
        callback: 'callback',
        reminder: 'reminder'
    };
    return classes[type] || 'message';
}

function getNotifIcon(type) {
    const icons = {
        appointment: 'fas fa-calendar-check',
        lab: 'fas fa-flask',
        wellness: 'fas fa-heart-pulse',
        message: 'fas fa-envelope',
        callback: 'fas fa-phone-alt',
        reminder: 'fas fa-clock'
    };
    return icons[type] || 'fas fa-bell';
}

function navigateToNotification(type) {
    const routes = {
        appointment: 'appointments.html',
        lab: 'lab-orders.html',
        wellness: 'wellness.html',
        message: 'messages.html',
        callback: 'callbacks.html',
        reminder: 'reminders.html'
    };
    if (routes[type]) {
        window.location.href = toAdminPath(routes[type]);
    }
}

function markNotificationRead(id, type) {
    // Update local state
    const notif = allNotifications.find(n => n.id === id);
    if (notif) notif.read = true;
    
    // Update in Firestore
    const collections = {
        appointment: 'appointments',
        lab: 'lab_orders',
        wellness: 'wellness_bookings',
        message: 'contact_messages',
        callback: 'callback_requests',
        reminder: 'reminders'
    };
    
    if (collections[type] && typeof db !== 'undefined') {
        db.collection(collections[type]).doc(id).update({
            notificationRead: true
        }).catch(err => console.log('Could not mark as read:', err));
    }
    
    renderNotifications();
    updateNotificationBadgeFromList();
}

function markAllNotificationsRead() {
    allNotifications.forEach(notif => {
        if (!notif.read) {
            markNotificationRead(notif.id, notif.type);
        }
    });
}

function updateNotificationBadgeFromList() {
    const unreadCount = allNotifications.filter(n => !n.read).length;
    if (notifCount) {
        notifCount.textContent = unreadCount > 99 ? '99+' : unreadCount;
        notifCount.style.display = unreadCount > 0 ? 'flex' : 'none';
    }
}

// ========================================
// Reminders System
// ========================================

async function addReminder(title, reminderDate, relatedType = null, relatedId = null) {
    if (typeof db === 'undefined') return null;
    
    try {
        const docRef = await db.collection('reminders').add({
            title: title,
            reminderDate: firebase.firestore.Timestamp.fromDate(new Date(reminderDate)),
            relatedType: relatedType,
            relatedId: relatedId,
            status: 'pending',
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error('Error adding reminder:', error);
        return null;
    }
}

async function completeReminder(reminderId) {
    if (typeof db === 'undefined') return;
    
    try {
        await db.collection('reminders').doc(reminderId).update({
            status: 'completed'
        });
    } catch (error) {
        console.error('Error completing reminder:', error);
    }
}

// Logout Function
function logout() {
    try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch (_) { /* ignore */ }
    firebase.auth().signOut().then(async () => {
        // Remove the local copy of clinic data from this computer
        try { await db.terminate(); await db.clearPersistence(); } catch (_) { /* nothing cached */ }
        window.location.href = toAdminPath('login.html');
    }).catch((error) => {
        console.error('Logout error:', error);
        alert('Error logging out. Please try again.');
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
}

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Initialize notification panel on all admin pages
    initNotificationPanel();
    
    // Only setup dashboard realtime if on the dashboard page
    if (document.getElementById('appointmentsCount') || 
        document.getElementById('recentAppointments') ||
        document.getElementById('recentMessages')) {
        setupDashboardRealtime();
    }
});

// ---------- Instant shell ----------
// A staff profile verified earlier in this tab (by the login page or the previous
// admin page) draws the menus and page immediately, without waiting for Firebase
// to start. onAuthStateChanged above still confirms the session and re-checks the
// record with the server; data itself is always protected by Firestore rules.
const earlyProfile = (() => {
    const cached = readCachedProfile();
    return cached && cached.status === 'active' ? cached : null;
})();
if (earlyProfile) applyProfile(earlyProfile);

