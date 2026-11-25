// Profile Page - Real-time Firebase Management
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    firebase.auth().onAuthStateChanged(function(user) {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        initProfile(user);
    });
});

// Initialize Profile
function initProfile(user) {
    const db = firebase.firestore();
    
    // DOM Elements - Display
    const profileImage = document.getElementById('profileImage');
    const avatarPlaceholder = document.getElementById('avatarPlaceholder');
    const displayName = document.getElementById('displayName');
    const displayEmail = document.getElementById('displayEmail');
    const displayRole = document.getElementById('displayRole');
    const displayDept = document.getElementById('displayDept');
    const memberSince = document.getElementById('memberSince');
    const lastLogin = document.getElementById('lastLogin');
    const accountStatus = document.getElementById('accountStatus');
    
    // DOM Elements - Form
    const firstName = document.getElementById('firstName');
    const lastName = document.getElementById('lastName');
    const email = document.getElementById('email');
    const phone = document.getElementById('phone');
    const bio = document.getElementById('bio');
    
    // DOM Elements - Password
    const currentPassword = document.getElementById('currentPassword');
    const newPassword = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    
    // DOM Elements - Buttons & Forms
    const avatarInput = document.getElementById('avatarInput');
    const profileForm = document.getElementById('profileForm');
    const passwordForm = document.getElementById('passwordForm');
    const activityList = document.getElementById('activityList');
    
    // Real-time listener for user profile
    const userRef = db.collection('admin_users').doc(user.uid);
    let unsubscribeProfile = null;
    
    unsubscribeProfile = userRef.onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            
            // Update sidebar display
            if (displayName) displayName.textContent = `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Admin User';
            if (displayEmail) displayEmail.textContent = data.email || user.email;
            
            // Update role badge
            if (displayRole) {
                const roleText = data.role === 'super_admin' ? 'Super Admin' : 
                                data.role === 'admin' ? 'Admin' : 
                                data.role === 'moderator' ? 'Moderator' : 
                                data.role === 'viewer' ? 'Viewer' : 'Staff';
                displayRole.innerHTML = `<i class="fas fa-shield-alt"></i> ${roleText}`;
            }
            
            // Update department badge
            if (displayDept && data.department) {
                displayDept.innerHTML = `<i class="fas fa-building"></i> ${escapeAdminHTML(data.department)}`;
                displayDept.style.display = 'inline-flex';
            }
            
            // Update avatar
            if (data.avatar && profileImage) {
                profileImage.src = data.avatar;
                profileImage.style.display = 'block';
                if (avatarPlaceholder) avatarPlaceholder.style.display = 'none';
            } else {
                if (profileImage) profileImage.style.display = 'none';
                if (avatarPlaceholder) avatarPlaceholder.style.display = 'flex';
            }
            
            // Update form fields
            if (firstName) firstName.value = data.firstName || '';
            if (lastName) lastName.value = data.lastName || '';
            if (email) email.value = data.email || user.email;
            if (phone) phone.value = data.phone || '';
            if (bio) bio.value = data.bio || '';
            
            // Update account info
            if (memberSince && data.createdAt) {
                const createdDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
                memberSince.textContent = formatDate(createdDate);
            }
            
            if (lastLogin && data.lastLogin) {
                const loginDate = data.lastLogin.toDate ? data.lastLogin.toDate() : new Date(data.lastLogin);
                lastLogin.textContent = formatRelativeTime(loginDate);
            }
            
            if (accountStatus) {
                const status = data.status || 'active';
                accountStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
                accountStatus.style.color = status === 'active' ? '#059669' : 
                                           status === 'suspended' ? '#dc2626' : '#f59e0b';
            }
            
            // Load activity log
            if (data.activityLog && activityList) {
                loadActivityLog(data.activityLog);
            }
        } else {
            // Staff records are provisioned by an authorized administrator.
            // The shared auth gate handles a missing record; do not race it
            // with a browser-side role/profile creation.
            return;
        }
        
        // Hide loading overlay
        hidePermissionsLoading();
    }, (error) => {
        console.error('Error loading profile:', error);
        hidePermissionsLoading();
    });
    
    // Update last login timestamp
    userRef.update({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.log('Could not update last login:', err));
    
    // Avatar upload handler
    if (avatarInput) {
        avatarInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            // Validate file type
            if (!file.type.startsWith('image/')) {
                showToast('Please select an image file.', 'error');
                return;
            }
            
            // Validate file size (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                showToast('Image size must be less than 2MB.', 'error');
                return;
            }
            
            try {
                // Convert to base64
                const reader = new FileReader();
                reader.onload = async function(event) {
                    const base64 = event.target.result;
                    
                    // Resize image if needed
                    const resizedImage = await resizeImage(base64, 200, 200);
                    
                    // Save to Firestore
                    await userRef.update({
                        avatar: resizedImage,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    // Log activity
                    await logActivity(userRef, 'avatar_updated', 'Profile picture was updated');
                    
                    showToast('Profile picture updated!', 'success');
                };
                reader.readAsDataURL(file);
            } catch (error) {
                console.error('Error uploading avatar:', error);
                showToast('Failed to upload image. Please try again.', 'error');
            }
        });
    }
    
    // Profile form submit
    if (profileForm) {
        profileForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const saveBtn = document.getElementById('saveProfileBtn');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            }
            
            try {
                await userRef.update({
                    firstName: firstName ? firstName.value.trim() : '',
                    lastName: lastName ? lastName.value.trim() : '',
                    phone: phone ? phone.value.trim() : '',
                    bio: bio ? bio.value.trim() : '',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Log activity
                await logActivity(userRef, 'profile_updated', 'Profile information was updated');
                
                showToast('Profile updated successfully!', 'success');
            } catch (error) {
                console.error('Error updating profile:', error);
                showToast('Failed to update profile. Please try again.', 'error');
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
                }
            }
        });
    }
    
    // Password form submit
    if (passwordForm) {
        passwordForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const currentPwd = currentPassword ? currentPassword.value : '';
            const newPwd = newPassword ? newPassword.value : '';
            const confirmPwd = confirmPassword ? confirmPassword.value : '';
            
            // Validation
            if (!currentPwd || !newPwd || !confirmPwd) {
                showToast('Please fill in all password fields.', 'error');
                return;
            }
            
            if (newPwd !== confirmPwd) {
                showToast('New passwords do not match.', 'error');
                return;
            }
            
            if (newPwd.length < 8) {
                showToast('Password must be at least 8 characters.', 'error');
                return;
            }
            
            const updateBtn = document.getElementById('updatePasswordBtn');
            if (updateBtn) {
                updateBtn.disabled = true;
                updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
            }
            
            try {
                // Re-authenticate user
                const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPwd);
                await user.reauthenticateWithCredential(credential);
                
                // Update password
                await user.updatePassword(newPwd);
                
                // Log activity
                await logActivity(userRef, 'password_changed', 'Password was changed');
                
                // Clear form
                if (currentPassword) currentPassword.value = '';
                if (newPassword) newPassword.value = '';
                if (confirmPassword) confirmPassword.value = '';
                
                // Reset strength indicator
                resetPasswordStrength();
                
                showToast('Password updated successfully!', 'success');
            } catch (error) {
                console.error('Error updating password:', error);
                
                if (error.code === 'auth/wrong-password') {
                    showToast('Current password is incorrect.', 'error');
                } else if (error.code === 'auth/weak-password') {
                    showToast('Please choose a stronger password.', 'error');
                } else {
                    showToast('Failed to update password. Please try again.', 'error');
                }
            } finally {
                if (updateBtn) {
                    updateBtn.disabled = false;
                    updateBtn.innerHTML = '<i class="fas fa-key"></i> Update Password';
                }
            }
        });
    }
    
    // Password strength indicator
    if (newPassword) {
        newPassword.addEventListener('input', function() {
            updatePasswordStrength(this.value);
        });
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
        if (unsubscribeProfile) unsubscribeProfile();
    });
}

// Load activity log
function loadActivityLog(activities) {
    const activityList = document.getElementById('activityList');
    if (!activityList || !Array.isArray(activities)) return;
    
    // Sort by timestamp (newest first) and take last 10
    const sortedActivities = [...activities]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);
    
    activityList.innerHTML = sortedActivities.map(activity => {
        const icon = getActivityIcon(activity.action);
        const time = formatRelativeTime(new Date(activity.timestamp));
        
        return `
            <div class="activity-item">
                <div class="activity-icon ${activity.action}"><i class="${icon}"></i></div>
                <div class="activity-content">
                    <p class="title">${activity.details || activity.action}</p>
                    <p class="time">${time}</p>
                </div>
            </div>
        `;
    }).join('');
}

// Get activity icon
function getActivityIcon(action) {
    const icons = {
        'login': 'fas fa-sign-in-alt',
        'logout': 'fas fa-sign-out-alt',
        'profile_updated': 'fas fa-user-edit',
        'avatar_updated': 'fas fa-camera',
        'password_changed': 'fas fa-key',
        'settings_updated': 'fas fa-cog',
        'account_created': 'fas fa-user-plus'
    };
    return icons[action] || 'fas fa-circle';
}

// Log activity
async function logActivity(userRef, action, details) {
    try {
        await userRef.update({
            activityLog: firebase.firestore.FieldValue.arrayUnion({
                action: action,
                timestamp: new Date().toISOString(),
                details: details
            })
        });
    } catch (error) {
        console.log('Could not log activity:', error);
    }
}

// Update password strength indicator
function updatePasswordStrength(password) {
    const bars = [
        document.getElementById('str1'),
        document.getElementById('str2'),
        document.getElementById('str3'),
        document.getElementById('str4')
    ];
    
    let strength = 0;
    
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z\d]/.test(password)) strength++;
    
    const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'];
    
    bars.forEach((bar, index) => {
        if (bar) {
            if (index < strength) {
                bar.style.background = colors[Math.min(strength - 1, 3)];
            } else {
                bar.style.background = '#e2e8f0';
            }
        }
    });
}

// Reset password strength indicator
function resetPasswordStrength() {
    const bars = ['str1', 'str2', 'str3', 'str4'];
    bars.forEach(id => {
        const bar = document.getElementById(id);
        if (bar) bar.style.background = '#e2e8f0';
    });
}

// Resize image
function resizeImage(base64, maxWidth, maxHeight) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = base64;
    });
}

// Format date
function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format relative time
function formatRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return formatDate(date);
}

// Hide permissions loading overlay
function hidePermissionsLoading() {
    const overlay = document.getElementById('permissionsLoading');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    if (toast && toastMessage) {
        // Update icon based on type
        const icon = toast.querySelector('i');
        if (icon) {
            icon.className = type === 'success' ? 'fas fa-check-circle' : 
                            type === 'error' ? 'fas fa-exclamation-circle' : 
                            'fas fa-info-circle';
        }
        
        // Set message and show
        toastMessage.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}
