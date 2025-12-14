/* ========================================
   Admin Login JavaScript - Secure
   ======================================== */

// DOM Elements
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const togglePassword = document.getElementById('togglePassword');
const loginBtn = document.getElementById('loginBtn');
const errorMessage = document.getElementById('errorMessage');
const loadingOverlay = document.getElementById('loadingOverlay');
const forgotPassword = document.getElementById('forgotPassword');

// Security: Rate limiting
let loginAttempts = 0;
let lockoutTime = null;
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

// Check if already logged in
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        window.location.href = '/admin/';
    }
});

// Toggle Password Visibility
if (togglePassword) {
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        togglePassword.innerHTML = `<i class="fas fa-${type === 'password' ? 'eye' : 'eye-slash'}"></i>`;
    });
}

// Show Error
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
}

// Hide Error
function hideError() {
    errorMessage.classList.remove('show');
}

// Show Loading
function showLoading() {
    loadingOverlay.classList.add('show');
    loginBtn.disabled = true;
}

// Hide Loading
function hideLoading() {
    loadingOverlay.classList.remove('show');
    loginBtn.disabled = false;
}

// Check if locked out
function isLockedOut() {
    if (lockoutTime && Date.now() < lockoutTime) {
        const remainingTime = Math.ceil((lockoutTime - Date.now()) / 1000 / 60);
        showError(`Too many failed attempts. Try again in ${remainingTime} minute(s).`);
        return true;
    }
    if (lockoutTime && Date.now() >= lockoutTime) {
        lockoutTime = null;
        loginAttempts = 0;
    }
    return false;
}

// Sanitize input
function sanitizeInput(input) {
    return input.trim().replace(/[<>]/g, '');
}

// Validate email format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Login Form Submit
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();

        // Check lockout
        if (isLockedOut()) return;

        const email = sanitizeInput(emailInput.value);
        const password = passwordInput.value;

        // Validation
        if (!email || !password) {
            showError('Please fill in all fields');
            return;
        }

        if (!isValidEmail(email)) {
            showError('Please enter a valid email address');
            return;
        }

        if (password.length < 6) {
            showError('Password must be at least 6 characters');
            return;
        }

        showLoading();

        try {
            // Set session persistence (expires when browser closes)
            await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
            
            // Sign in with Firebase
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
            
            // Reset attempts on success
            loginAttempts = 0;
            lockoutTime = null;

            // Store login timestamp
            sessionStorage.setItem('loginTime', Date.now().toString());

            // Redirect to dashboard
            window.location.href = '/admin/';

        } catch (error) {
            hideLoading();
            loginAttempts++;

            // Check if should lockout
            if (loginAttempts >= MAX_ATTEMPTS) {
                lockoutTime = Date.now() + LOCKOUT_DURATION;
                showError('Too many failed attempts. Please try again in 5 minutes.');
                return;
            }

            // Handle errors (generic messages for security)
            switch (error.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    showError('Invalid email or password');
                    break;
                case 'auth/invalid-email':
                    showError('Invalid email address');
                    break;
                case 'auth/too-many-requests':
                    showError('Too many failed attempts. Please try again later.');
                    break;
                case 'auth/user-disabled':
                    showError('This account has been disabled');
                    break;
                case 'auth/network-request-failed':
                    showError('Network error. Please check your connection.');
                    break;
                default:
                    showError('Login failed. Please try again.');
            }
        }
    });
}

// Forgot Password
if (forgotPassword) {
    forgotPassword.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const email = sanitizeInput(emailInput.value);
        
        if (!email) {
            showError('Please enter your email address first');
            return;
        }

        if (!isValidEmail(email)) {
            showError('Please enter a valid email address');
            return;
        }

        showLoading();

        try {
            await firebase.auth().sendPasswordResetEmail(email);
            hideLoading();
            hideError();
            alert('If an account exists with this email, a password reset link has been sent.');
        } catch (error) {
            hideLoading();
            // Generic message for security
            alert('If an account exists with this email, a password reset link has been sent.');
        }
    });
}

// Prevent form resubmission on refresh
if (window.history.replaceState) {
    window.history.replaceState(null, null, window.location.href);
}

// Clear password on page unload
window.addEventListener('beforeunload', () => {
    if (passwordInput) passwordInput.value = '';
});

// Disable autocomplete for password
if (passwordInput) {
    passwordInput.setAttribute('autocomplete', 'new-password');
}

// Enter key on email moves to password
emailInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        passwordInput.focus();
    }
});
