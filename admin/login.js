/* ========================================
   Admin login
   Signs in, confirms the staff record right here (so any problem is shown on
   this form instead of a silent bounce), then opens the dashboard instantly
   using the verified profile. The dashboard re-checks it with the server.
   ======================================== */

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const togglePassword = document.getElementById('togglePassword');
const loginBtn = document.getElementById('loginBtn');
const errorMessage = document.getElementById('errorMessage');
const forgotPassword = document.getElementById('forgotPassword');

// Shared with admin/admin.js
const PROFILE_CACHE_KEY = 'mf_admin_profile';
const LOGIN_NOTICE_KEY = 'mf_login_notice';
const DASHBOARD = '/admin';
const CHECK_TIMEOUT = 5000;   // then hand over to the dashboard, which retries and explains

// Client-side throttle (Firebase also rate-limits on the server)
let loginAttempts = 0;
let lockoutTime = null;
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 5 * 60 * 1000;
let busy = false;

// ---------- UI ----------
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
}
function hideError() { errorMessage.classList.remove('show'); }

function setBusy(on, label = 'Signing in…') {
    busy = on;
    loginBtn.disabled = on;
    loginBtn.setAttribute('aria-busy', String(on));
    loginBtn.innerHTML = on ? `<span class="btn-spinner" aria-hidden="true"></span>${label}` : 'Sign in';
}

togglePassword?.addEventListener('click', () => {
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    togglePassword.setAttribute('aria-pressed', String(show));
    togglePassword.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    togglePassword.innerHTML = `<i class="fas fa-${show ? 'eye-slash' : 'eye'}"></i>`;
});

// A message left by the dashboard when it ended a session (e.g. no staff record)
try {
    const notice = sessionStorage.getItem(LOGIN_NOTICE_KEY);
    if (notice) { showError(notice); sessionStorage.removeItem(LOGIN_NOTICE_KEY); }
} catch (_) { /* storage blocked */ }

// ---------- staff check ----------
const readCache = () => { try { return JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY) || 'null'); } catch (_) { return null; } };
function writeCache(p) {
    try {
        const { id, name, firstName, role, status, modules, permissions } = p;
        sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id, name, firstName, role, status, modules, permissions }));
    } catch (_) { /* storage full or blocked */ }
}

function withTimeout(promise, ms) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), ms); })
    ]).finally(() => clearTimeout(timer));
}

async function refuse(message) {
    try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch (_) { /* ignore */ }
    await firebase.auth().signOut().catch(() => {});
    setBusy(false);
    showError(message);
    passwordInput.value = '';
    passwordInput.focus();
}

const openDashboard = () => window.location.replace(DASHBOARD);

async function continueAs(user) {
    const cached = readCache();
    if (cached && cached.id === user.uid && cached.status === 'active') return openDashboard();
    if (typeof db === 'undefined') return openDashboard();   // dashboard will check

    setBusy(true, 'Opening dashboard…');
    try {
        const doc = await withTimeout(db.collection('admin_users').doc(user.uid).get(), CHECK_TIMEOUT);
        if (doc.exists) {
            const profile = { id: doc.id, ...doc.data() };
            if (profile.status !== 'active') return refuse('Your staff account is inactive. Please contact an administrator.');
            writeCache(profile);
            return openDashboard();
        }
        const token = await user.getIdTokenResult();
        if (token.claims.admin === true) return openDashboard();   // first admin: dashboard creates the record
        return refuse('This account is not set up for the staff dashboard. Ask an administrator to add you in User Management.');
    } catch (error) {
        if (error.code === 'permission-denied') {
            return refuse('Your staff access could not be verified. Ask an administrator to check your staff account.');
        }
        // Slow or offline: don't hold the person here; the dashboard retries and explains.
        console.warn('Staff check on login did not finish:', error.code || error.message);
        return openDashboard();
    }
}

// Already signed in (e.g. reopened tab): go straight through
firebase.auth().onAuthStateChanged(user => {
    if (user && !busy) void continueAs(user);
});

// ---------- sign in ----------
function isLockedOut() {
    if (lockoutTime && Date.now() < lockoutTime) {
        const minutes = Math.ceil((lockoutTime - Date.now()) / 60000);
        showError(`Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
        return true;
    }
    if (lockoutTime) { lockoutTime = null; loginAttempts = 0; }
    return false;
}

const isValidEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    hideError();
    if (isLockedOut()) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) return showError('Enter your email and password.');
    if (!isValidEmail(email)) { emailInput.focus(); return showError('Enter a valid email address.'); }

    setBusy(true);
    try {
        // Session persistence: signed out when the browser closes
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
        const { user } = await firebase.auth().signInWithEmailAndPassword(email, password);
        loginAttempts = 0;
        lockoutTime = null;
        try { sessionStorage.setItem('loginTime', Date.now().toString()); } catch (_) { /* ignore */ }
        await continueAs(user);
    } catch (error) {
        setBusy(false);
        loginAttempts++;
        if (loginAttempts >= MAX_ATTEMPTS) {
            lockoutTime = Date.now() + LOCKOUT_DURATION;
            return showError('Too many failed attempts. Please try again in 5 minutes.');
        }
        const messages = {
            'auth/user-not-found': 'Incorrect email or password.',
            'auth/wrong-password': 'Incorrect email or password.',
            'auth/invalid-credential': 'Incorrect email or password.',
            'auth/invalid-login-credentials': 'Incorrect email or password.',
            'auth/invalid-email': 'Enter a valid email address.',
            'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
            'auth/user-disabled': 'This account has been disabled.',
            'auth/network-request-failed': 'No connection. Check your internet and try again.'
        };
        showError(messages[error.code] || 'Sign-in failed. Please try again.');
        passwordInput.select();
    }
});

// ---------- forgot password ----------
forgotPassword?.addEventListener('click', async e => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!isValidEmail(email)) {
        emailInput.focus();
        return showError('Enter your email above first, then choose "Forgot password?".');
    }
    hideError();
    try { await firebase.auth().sendPasswordResetEmail(email); } catch (_) { /* same message either way */ }
    errorMessage.classList.add('show', 'is-info');
    errorMessage.textContent = `If ${email} has a staff account, a password reset link is on its way.`;
});
emailInput?.addEventListener('input', () => errorMessage.classList.remove('is-info'));

// ---------- warm the cache ----------
// While the person types, fetch the dashboard files so the redirect opens instantly.
function prefetchDashboard() {
    ['/admin', '/admin/admin.css', '/admin/dashboard.css', '/admin/security.js', '/admin/admin.js', '/admin/dashboard.js']
        .forEach(href => {
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = href;
            document.head.appendChild(link);
        });
}
if ('requestIdleCallback' in window) requestIdleCallback(prefetchDashboard, { timeout: 2000 });
else setTimeout(prefetchDashboard, 800);

// Don't keep the password in the field when leaving
window.addEventListener('pagehide', () => { if (passwordInput) passwordInput.value = ''; });
