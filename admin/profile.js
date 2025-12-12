// Profile Page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();

    // DOM Elements
    const profileImage = document.getElementById('profileImage');
    const avatarPlaceholder = document.getElementById('avatarPlaceholder');
    const avatarInput = document.getElementById('avatarInput');
    const displayName = document.getElementById('displayName');
    const displayEmail = document.getElementById('displayEmail');
    const profileForm = document.getElementById('profileForm');
    const passwordForm = document.getElementById('passwordForm');
    const toast = document.getElementById('toast');

    // Form fields
    const firstName = document.getElementById('firstName');
    const lastName = document.getElementById('lastName');
    const email = document.getElementById('email');
    const phone = document.getElementById('phone');
    const bio = document.getElementById('bio');

    // Password fields
    const currentPassword = document.getElementById('currentPassword');
    const newPassword = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmPassword');

    let currentUser = null;

    // Show toast notification
    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = 'toast ' + type + ' show';
        setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }

    // Load user profile
    async function loadProfile(user) {
        currentUser = user;
        email.value = user.email;
        displayEmail.textContent = user.email;

        try {
            const docSnap = await db.collection('admin_users').doc(user.uid).get();
            if (docSnap.exists) {
                const data = docSnap.data();
                firstName.value = data.firstName || '';
                lastName.value = data.lastName || '';
                phone.value = data.phone || '';
                bio.value = data.bio || '';
                
                const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ') || 'Admin User';
                displayName.textContent = fullName;

                if (data.photoURL) {
                    profileImage.src = data.photoURL;
                    profileImage.classList.add('loaded');
                    avatarPlaceholder.classList.add('hidden');
                }
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    }

    // Handle avatar upload
    avatarInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file', 'error');
            return;
        }

        if (file.size > 1 * 1024 * 1024) {
            showToast('Image must be less than 1MB', 'error');
            return;
        }

        // Show immediate preview using FileReader
        const reader = new FileReader();
        reader.onload = function(event) {
            profileImage.src = event.target.result;
            profileImage.classList.add('loaded');
            avatarPlaceholder.classList.add('hidden');
        };
        reader.readAsDataURL(file);

        try {
            showToast('Uploading image...');

            // Convert to base64 and store in Firestore directly (no Storage needed)
            const base64 = await fileToBase64(file);
            
            // Update Firestore with base64 image
            await db.collection('admin_users').doc(currentUser.uid).set({
                photoURL: base64,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            showToast('Profile picture updated!', 'success');
        } catch (error) {
            console.error('Error uploading image:', error);
            showToast('Failed to upload image', 'error');
        }
    });

    // Convert file to base64
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Handle profile form submission
    profileForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const saveBtn = document.getElementById('saveProfileBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {
            await db.collection('admin_users').doc(currentUser.uid).set({
                firstName: firstName.value.trim(),
                lastName: lastName.value.trim(),
                phone: phone.value.trim(),
                bio: bio.value.trim(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            const fullName = [firstName.value, lastName.value].filter(Boolean).join(' ') || 'Admin User';
            displayName.textContent = fullName;

            showToast('Profile updated successfully!', 'success');
        } catch (error) {
            console.error('Error updating profile:', error);
            showToast('Failed to update profile', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        }
    });

    // Handle password form submission
    passwordForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const current = currentPassword.value;
        const newPwd = newPassword.value;
        const confirm = confirmPassword.value;

        // Validation
        if (!current || !newPwd || !confirm) {
            showToast('Please fill in all password fields', 'error');
            return;
        }

        if (newPwd !== confirm) {
            showToast('New passwords do not match', 'error');
            return;
        }

        if (newPwd.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }

        const submitBtn = passwordForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

        try {
            // Re-authenticate user
            const credential = firebase.auth.EmailAuthProvider.credential(
                currentUser.email,
                current
            );
            await currentUser.reauthenticateWithCredential(credential);

            // Update password
            await currentUser.updatePassword(newPwd);

            // Clear form
            currentPassword.value = '';
            newPassword.value = '';
            confirmPassword.value = '';

            showToast('Password updated successfully!', 'success');
        } catch (error) {
            console.error('Error updating password:', error);
            if (error.code === 'auth/wrong-password') {
                showToast('Current password is incorrect', 'error');
            } else {
                showToast('Failed to update password', 'error');
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-key"></i> Update Password';
        }
    });

    // Auth state listener
    auth.onAuthStateChanged(function(user) {
        if (user) {
            loadProfile(user);
        } else {
            window.location.href = 'login.html';
        }
    });
});
