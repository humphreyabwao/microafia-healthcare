// Settings Page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const auth = firebase.auth();
    const db = firebase.firestore();

    // DOM Elements
    const toast = document.getElementById('toast');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    const exportDataBtn = document.getElementById('exportDataBtn');

    // Setting inputs
    const emailNotif = document.getElementById('emailNotif');
    const appointmentNotif = document.getElementById('appointmentNotif');
    const messageNotif = document.getElementById('messageNotif');
    const callbackNotif = document.getElementById('callbackNotif');
    const compactMode = document.getElementById('compactMode');
    const itemsPerPage = document.getElementById('itemsPerPage');
    const dateFormat = document.getElementById('dateFormat');
    const autoArchive = document.getElementById('autoArchive');

    let currentUser = null;

    // Show toast notification
    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = 'toast ' + type + ' show';
        setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }

    // Load settings from Firestore
    async function loadSettings(user) {
        currentUser = user;
        
        try {
            const docSnap = await db.collection('admin_settings').doc(user.uid).get();
            if (docSnap.exists) {
                const settings = docSnap.data();
                
                // Apply notification settings
                emailNotif.checked = settings.emailNotif !== false;
                appointmentNotif.checked = settings.appointmentNotif !== false;
                messageNotif.checked = settings.messageNotif !== false;
                callbackNotif.checked = settings.callbackNotif !== false;
                
                // Apply display settings
                compactMode.checked = settings.compactMode === true;
                if (settings.itemsPerPage) itemsPerPage.value = settings.itemsPerPage;
                if (settings.dateFormat) dateFormat.value = settings.dateFormat;
                autoArchive.checked = settings.autoArchive === true;

                // Apply compact mode if enabled
                if (settings.compactMode) {
                    document.body.classList.add('compact-mode');
                }
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    // Save settings to Firestore
    async function saveSettings() {
        if (!currentUser) return;

        saveSettingsBtn.disabled = true;
        saveSettingsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {
            await db.collection('admin_settings').doc(currentUser.uid).set({
                emailNotif: emailNotif.checked,
                appointmentNotif: appointmentNotif.checked,
                messageNotif: messageNotif.checked,
                callbackNotif: callbackNotif.checked,
                compactMode: compactMode.checked,
                itemsPerPage: itemsPerPage.value,
                dateFormat: dateFormat.value,
                autoArchive: autoArchive.checked,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Apply compact mode
            if (compactMode.checked) {
                document.body.classList.add('compact-mode');
            } else {
                document.body.classList.remove('compact-mode');
            }

            // Save to localStorage for quick access
            localStorage.setItem('adminSettings', JSON.stringify({
                itemsPerPage: itemsPerPage.value,
                dateFormat: dateFormat.value,
                compactMode: compactMode.checked
            }));

            showToast('Settings saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving settings:', error);
            showToast('Failed to save settings', 'error');
        } finally {
            saveSettingsBtn.disabled = false;
            saveSettingsBtn.innerHTML = '<i class="fas fa-save"></i> Save Settings';
        }
    }

    // Export data as CSV
    async function exportData() {
        exportDataBtn.disabled = true;
        exportDataBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';

        try {
            const collections = ['appointments', 'lab_orders', 'wellness_bookings', 'contact_messages', 'callback_requests'];
            let csvContent = '';

            for (const collectionName of collections) {
                const snapshot = await db.collection(collectionName).get();
                if (snapshot.empty) continue;

                // Add collection header
                csvContent += `\n=== ${collectionName.toUpperCase()} ===\n`;

                // Get headers from first document
                const firstDoc = snapshot.docs[0].data();
                const headers = Object.keys(firstDoc);
                csvContent += headers.join(',') + '\n';

                // Add data rows
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const row = headers.map(header => {
                        let value = data[header];
                        if (value === null || value === undefined) return '';
                        if (typeof value === 'object') {
                            if (value.toDate) value = value.toDate().toISOString();
                            else value = JSON.stringify(value);
                        }
                        // Escape quotes and wrap in quotes if contains comma
                        value = String(value).replace(/"/g, '""');
                        if (value.includes(',') || value.includes('\n')) {
                            value = `"${value}"`;
                        }
                        return value;
                    });
                    csvContent += row.join(',') + '\n';
                });
            }

            // Download file
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `microafia_export_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();

            showToast('Data exported successfully!', 'success');
        } catch (error) {
            console.error('Error exporting data:', error);
            showToast('Failed to export data', 'error');
        } finally {
            exportDataBtn.disabled = false;
            exportDataBtn.innerHTML = '<i class="fas fa-download"></i> Export';
        }
    }

    // Sign out
    async function signOut() {
        try {
            await auth.signOut();
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Error signing out:', error);
            showToast('Failed to sign out', 'error');
        }
    }

    // Event listeners
    saveSettingsBtn.addEventListener('click', saveSettings);
    signOutBtn.addEventListener('click', signOut);
    exportDataBtn.addEventListener('click', exportData);

    // Auth state listener
    auth.onAuthStateChanged(function(user) {
        if (user) {
            loadSettings(user);
        } else {
            window.location.href = 'login.html';
        }
    });
});
