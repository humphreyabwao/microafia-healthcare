// Settings Page - Real-time Firebase Management
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    firebase.auth().onAuthStateChanged(function(user) {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        initSettings(user);
    });
});

// Initialize Settings
function initSettings(user) {
    const db = firebase.firestore();
    
    // DOM Elements - Hospital Info
    const hospitalName = document.getElementById('hospitalName');
    const registrationNumber = document.getElementById('registrationNumber');
    const hospitalAddress = document.getElementById('hospitalAddress');
    const hospitalAbout = document.getElementById('hospitalAbout');
    
    // DOM Elements - Contact Info
    const contactPhone = document.getElementById('contactPhone');
    const contactEmail = document.getElementById('contactEmail');
    const contactWebsite = document.getElementById('contactWebsite');
    
    // DOM Elements - Notifications
    const emailNotif = document.getElementById('emailNotif');
    const appointmentNotif = document.getElementById('appointmentNotif');
    const messageNotif = document.getElementById('messageNotif');
    const callbackNotif = document.getElementById('callbackNotif');
    
    // DOM Elements - Display
    const compactMode = document.getElementById('compactMode');
    const itemsPerPage = document.getElementById('itemsPerPage');
    const dateFormat = document.getElementById('dateFormat');
    const autoArchive = document.getElementById('autoArchive');
    
    // DOM Elements - Buttons
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const exportDataBtn = document.getElementById('exportDataBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    
    // Working hours elements
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    
    // Real-time listener for hospital settings
    const hospitalSettingsRef = db.collection('settings').doc('hospital');
    let unsubscribeHospital = null;
    
    unsubscribeHospital = hospitalSettingsRef.onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            
            // Populate hospital info
            if (hospitalName) hospitalName.value = data.name || '';
            if (registrationNumber) registrationNumber.value = data.registrationNumber || '';
            if (hospitalAddress) hospitalAddress.value = data.address || '';
            if (hospitalAbout) hospitalAbout.value = data.about || '';
            
            // Populate contact info
            if (contactPhone) contactPhone.value = data.phone || '';
            if (contactEmail) contactEmail.value = data.email || '';
            if (contactWebsite) contactWebsite.value = data.website || '';
            
            // Populate working hours
            if (data.workingHours) {
                days.forEach(day => {
                    const openInput = document.getElementById(`${day}Open`);
                    const closeInput = document.getElementById(`${day}Close`);
                    const closedCheckbox = document.getElementById(`${day}Closed`);
                    const dayCard = document.getElementById(`day${day.charAt(0).toUpperCase() + day.slice(1)}`);
                    
                    if (data.workingHours[day]) {
                        if (openInput) openInput.value = data.workingHours[day].open || '09:00';
                        if (closeInput) closeInput.value = data.workingHours[day].close || '17:00';
                        
                        // Handle closed days
                        if (closedCheckbox) {
                            closedCheckbox.checked = data.workingHours[day].closed || false;
                            if (data.workingHours[day].closed) {
                                if (dayCard) dayCard.classList.add('closed');
                                if (openInput) openInput.disabled = true;
                                if (closeInput) closeInput.disabled = true;
                            }
                        }
                    }
                });
            }
        }
        
        // Hide loading overlay
        hidePermissionsLoading();
    }, (error) => {
        console.error('Error loading hospital settings:', error);
        hidePermissionsLoading();
    });
    
    // Real-time listener for user display settings
    const userSettingsRef = db.collection('admin_users').doc(user.uid);
    let unsubscribeUser = null;
    
    unsubscribeUser = userSettingsRef.onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            const settings = data.settings || {};
            
            // Notification settings
            if (emailNotif) emailNotif.checked = settings.emailNotifications !== false;
            if (appointmentNotif) appointmentNotif.checked = settings.appointmentNotifications !== false;
            if (messageNotif) messageNotif.checked = settings.messageNotifications !== false;
            if (callbackNotif) callbackNotif.checked = settings.callbackNotifications !== false;
            
            // Display settings
            if (compactMode) compactMode.checked = settings.compactMode === true;
            if (itemsPerPage) itemsPerPage.value = settings.itemsPerPage || '10';
            if (dateFormat) dateFormat.value = settings.dateFormat || 'MM/DD/YYYY';
            if (autoArchive) autoArchive.value = settings.autoArchive || '30';
        }
    }, (error) => {
        console.error('Error loading user settings:', error);
    });
    
    // Setup day card closed checkbox handlers
    setupDayCardToggles();
    
    // Save all settings
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async function() {
            saveSettingsBtn.disabled = true;
            saveSettingsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            
            try {
                // Collect working hours
                const workingHours = {};
                days.forEach(day => {
                    const openInput = document.getElementById(`${day}Open`);
                    const closeInput = document.getElementById(`${day}Close`);
                    const closedCheckbox = document.getElementById(`${day}Closed`);
                    
                    workingHours[day] = {
                        open: openInput ? openInput.value : '09:00',
                        close: closeInput ? closeInput.value : '17:00',
                        closed: closedCheckbox ? closedCheckbox.checked : false
                    };
                });
                
                // Save hospital settings
                await hospitalSettingsRef.set({
                    name: hospitalName ? hospitalName.value : '',
                    registrationNumber: registrationNumber ? registrationNumber.value : '',
                    address: hospitalAddress ? hospitalAddress.value : '',
                    about: hospitalAbout ? hospitalAbout.value : '',
                    phone: contactPhone ? contactPhone.value : '',
                    email: contactEmail ? contactEmail.value : '',
                    website: contactWebsite ? contactWebsite.value : '',
                    workingHours: workingHours,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: user.uid
                }, { merge: true });
                
                // Save user-specific settings
                await userSettingsRef.set({
                    settings: {
                        emailNotifications: emailNotif ? emailNotif.checked : true,
                        appointmentNotifications: appointmentNotif ? appointmentNotif.checked : true,
                        messageNotifications: messageNotif ? messageNotif.checked : true,
                        callbackNotifications: callbackNotif ? callbackNotif.checked : true,
                        compactMode: compactMode ? compactMode.checked : false,
                        itemsPerPage: itemsPerPage ? itemsPerPage.value : '10',
                        dateFormat: dateFormat ? dateFormat.value : 'MM/DD/YYYY',
                        autoArchive: autoArchive ? autoArchive.value : '30'
                    },
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                
                showToast('Settings saved successfully!', 'success');
            } catch (error) {
                console.error('Error saving settings:', error);
                showToast('Failed to save settings. Please try again.', 'error');
            } finally {
                saveSettingsBtn.disabled = false;
                saveSettingsBtn.innerHTML = '<i class="fas fa-save"></i> Save All Settings';
            }
        });
    }
    
    // Export data
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', async function() {
            exportDataBtn.disabled = true;
            exportDataBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
            
            try {
                const exportData = {
                    exportDate: new Date().toISOString(),
                    hospital: {},
                    appointments: [],
                    messages: [],
                    labOrders: [],
                    callbacks: [],
                    wellness: []
                };
                
                // Get hospital settings
                const hospitalDoc = await hospitalSettingsRef.get();
                if (hospitalDoc.exists) {
                    exportData.hospital = hospitalDoc.data();
                }
                
                // Get appointments
                const appointmentsSnap = await db.collection('appointments').get();
                appointmentsSnap.forEach(doc => {
                    exportData.appointments.push({ id: doc.id, ...doc.data() });
                });
                
                // Get messages
                const messagesSnap = await db.collection('messages').get();
                messagesSnap.forEach(doc => {
                    exportData.messages.push({ id: doc.id, ...doc.data() });
                });
                
                // Get lab orders
                const labOrdersSnap = await db.collection('lab_orders').get();
                labOrdersSnap.forEach(doc => {
                    exportData.labOrders.push({ id: doc.id, ...doc.data() });
                });
                
                // Get callbacks
                const callbacksSnap = await db.collection('callbacks').get();
                callbacksSnap.forEach(doc => {
                    exportData.callbacks.push({ id: doc.id, ...doc.data() });
                });
                
                // Get wellness bookings
                const wellnessSnap = await db.collection('wellness_bookings').get();
                wellnessSnap.forEach(doc => {
                    exportData.wellness.push({ id: doc.id, ...doc.data() });
                });
                
                // Create and download file
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `microafia-backup-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                showToast('Data exported successfully!', 'success');
            } catch (error) {
                console.error('Error exporting data:', error);
                showToast('Failed to export data. Please try again.', 'error');
            } finally {
                exportDataBtn.disabled = false;
                exportDataBtn.innerHTML = '<i class="fas fa-download"></i> Export';
            }
        });
    }
    
    // Sign out
    if (signOutBtn) {
        signOutBtn.addEventListener('click', function() {
            if (confirm('Are you sure you want to sign out?')) {
                firebase.auth().signOut().then(() => {
                    window.location.href = 'login.html';
                }).catch(error => {
                    console.error('Error signing out:', error);
                    showToast('Failed to sign out. Please try again.', 'error');
                });
            }
        });
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
        if (unsubscribeHospital) unsubscribeHospital();
        if (unsubscribeUser) unsubscribeUser();
    });
}

// Setup day card toggle functionality using checkboxes
function setupDayCardToggles() {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    
    days.forEach(day => {
        const closedCheckbox = document.getElementById(`${day}Closed`);
        const openInput = document.getElementById(`${day}Open`);
        const closeInput = document.getElementById(`${day}Close`);
        const dayCard = document.getElementById(`day${day.charAt(0).toUpperCase() + day.slice(1)}`);
        
        if (closedCheckbox) {
            closedCheckbox.addEventListener('change', function() {
                const isClosed = this.checked;
                
                if (dayCard) {
                    if (isClosed) {
                        dayCard.classList.add('closed');
                    } else {
                        dayCard.classList.remove('closed');
                    }
                }
                
                if (openInput) openInput.disabled = isClosed;
                if (closeInput) closeInput.disabled = isClosed;
            });
        }
    });
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
