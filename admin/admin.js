/* ========================================
   Admin Dashboard JavaScript
   ======================================== */

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
// Firestore Data Loading
// ========================================

// Load Dashboard Stats
async function loadDashboardStats() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get counts for each collection
        const [appointments, labOrders, wellness, messages] = await Promise.all([
            db.collection('appointments').get(),
            db.collection('lab_orders').get(),
            db.collection('wellness_bookings').get(),
            db.collection('contact_messages').get()
        ]);

        // Count today's submissions
        let todayAppointments = 0;
        let todayLabOrders = 0;
        let todayWellness = 0;
        let todayMessages = 0;

        appointments.forEach(doc => {
            const data = doc.data();
            if (data.created_at && data.created_at.toDate() >= today) todayAppointments++;
        });

        labOrders.forEach(doc => {
            const data = doc.data();
            if (data.created_at && data.created_at.toDate() >= today) todayLabOrders++;
        });

        wellness.forEach(doc => {
            const data = doc.data();
            if (data.created_at && data.created_at.toDate() >= today) todayWellness++;
        });

        messages.forEach(doc => {
            const data = doc.data();
            if (data.created_at && data.created_at.toDate() >= today) todayMessages++;
        });

        // Update stats display
        const appointmentsEl = document.getElementById('appointmentsCount');
        const labOrdersEl = document.getElementById('labOrdersCount');
        const wellnessEl = document.getElementById('wellnessCount');
        const messagesEl = document.getElementById('messagesCount');

        if (appointmentsEl) appointmentsEl.textContent = appointments.size;
        if (labOrdersEl) labOrdersEl.textContent = labOrders.size;
        if (wellnessEl) wellnessEl.textContent = wellness.size;
        if (messagesEl) messagesEl.textContent = messages.size;

        // Update notification badge
        const totalToday = todayAppointments + todayLabOrders + todayWellness + todayMessages;
        if (notifCount) {
            notifCount.textContent = totalToday > 99 ? '99+' : totalToday;
            notifCount.style.display = totalToday > 0 ? 'flex' : 'none';
        }

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load Recent Appointments
async function loadRecentAppointments() {
    const tbody = document.getElementById('recentAppointments');
    if (!tbody) return;
    
    try {
        const snapshot = await db.collection('appointments')
            .orderBy('created_at', 'desc')
            .limit(5)
            .get();

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><i class="fas fa-calendar-alt"></i><p>No appointments yet</p></td></tr>';
            return;
        }

        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.name || '-'}</td>
                <td>${data.service || '-'}</td>
                <td>${data.date || '-'}</td>
                <td><span class="status-badge pending">Pending</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading appointments:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="loading">Error loading data</td></tr>';
    }
}

// Load Recent Lab Orders
async function loadRecentLabOrders() {
    const tbody = document.getElementById('recentLabOrders');
    if (!tbody) return;
    
    try {
        const snapshot = await db.collection('lab_orders')
            .orderBy('created_at', 'desc')
            .limit(5)
            .get();

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><i class="fas fa-flask"></i><p>No lab orders yet</p></td></tr>';
            return;
        }

        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const tests = data.tests ? data.tests.join(', ') : '-';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.name || '-'}</td>
                <td>${tests.length > 30 ? tests.substring(0, 30) + '...' : tests}</td>
                <td>₦${(data.total || 0).toLocaleString()}</td>
                <td><span class="status-badge pending">Pending</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading lab orders:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="loading">Error loading data</td></tr>';
    }
}

// Load Recent Wellness Bookings
async function loadRecentWellness() {
    const tbody = document.getElementById('recentWellness');
    if (!tbody) return;
    
    try {
        const snapshot = await db.collection('wellness_bookings')
            .orderBy('created_at', 'desc')
            .limit(5)
            .get();

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><i class="fas fa-spa"></i><p>No wellness bookings yet</p></td></tr>';
            return;
        }

        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.name || '-'}</td>
                <td>${data.package || '-'}</td>
                <td>${data.date || '-'}</td>
                <td><span class="status-badge pending">Pending</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading wellness bookings:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="loading">Error loading data</td></tr>';
    }
}

// Load Recent Messages
async function loadRecentMessages() {
    const container = document.getElementById('recentMessages');
    if (!container) return;
    
    try {
        const snapshot = await db.collection('contact_messages')
            .orderBy('created_at', 'desc')
            .limit(5)
            .get();

        if (snapshot.empty) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-envelope"></i><p>No messages yet</p></div>';
            return;
        }

        container.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const initials = (data.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            const time = data.created_at ? formatTimeAgo(data.created_at.toDate()) : '';
            
            const div = document.createElement('div');
            div.className = 'message-item';
            div.innerHTML = `
                <div class="message-avatar">${initials}</div>
                <div class="message-content">
                    <div class="message-name">${data.name || 'Unknown'}</div>
                    <div class="message-text">${data.message || 'No message'}</div>
                    <div class="message-time">${time}</div>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading messages:', error);
        container.innerHTML = '<div class="loading">Error loading data</div>';
    }
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

// Logout Function
function logout() {
    firebase.auth().signOut().then(() => {
        window.location.href = '../index.html';
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

// Real-time listeners for live updates
function setupRealtimeListeners() {
    // Listen for new appointments
    db.collection('appointments').orderBy('created_at', 'desc').limit(5)
        .onSnapshot(() => {
            loadRecentAppointments();
            loadDashboardStats();
        });

    // Listen for new lab orders
    db.collection('lab_orders').orderBy('created_at', 'desc').limit(5)
        .onSnapshot(() => {
            loadRecentLabOrders();
            loadDashboardStats();
        });

    // Listen for new wellness bookings
    db.collection('wellness_bookings').orderBy('created_at', 'desc').limit(5)
        .onSnapshot(() => {
            loadRecentWellness();
            loadDashboardStats();
        });

    // Listen for new messages
    db.collection('contact_messages').orderBy('created_at', 'desc').limit(5)
        .onSnapshot(() => {
            loadRecentMessages();
            loadDashboardStats();
        });
}

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardStats();
    loadRecentAppointments();
    loadRecentLabOrders();
    loadRecentWellness();
    loadRecentMessages();
    setupRealtimeListeners();
});
