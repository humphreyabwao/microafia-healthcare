// In-browser stand-in for Firebase used by admin-login.test.cjs (never touches production).
// Auth state lives in sessionStorage so it survives the login -> dashboard navigation.
(() => {
    const KEY = 'mockUser';
    const accounts = {
        'staff@test.dev': { uid: 'u-staff', password: 'secret123' },
        'nostaff@test.dev': { uid: 'u-nostaff', password: 'secret123' },
        'inactive@test.dev': { uid: 'u-inactive', password: 'secret123' }
    };
    const staff = {
        'u-staff': { name: 'Test Staff', role: 'admin', status: 'active', modules: ['dashboard'], permissions: {} },
        'u-inactive': { name: 'Old Staff', role: 'staff', status: 'inactive', modules: ['dashboard'], permissions: {} }
    };
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const setting = (name, fallback) => sessionStorage.getItem(name) ?? fallback;
    let current = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    const asUser = u => u && { uid: u.uid, email: u.email, getIdTokenResult: async () => ({ claims: {} }) };

    const auth = {
        get currentUser() { return asUser(current); },
        onAuthStateChanged(fn) { setTimeout(() => fn(asUser(current)), 15); return () => {}; },
        async setPersistence() {},
        async signInWithEmailAndPassword(email, password) {
            await delay(Number(setting('mockAuthDelay', 120)));
            const account = accounts[email];
            if (!account || account.password !== password) throw Object.assign(new Error('bad'), { code: 'auth/invalid-credential' });
            current = { uid: account.uid, email };
            sessionStorage.setItem(KEY, JSON.stringify(current));
            return { user: asUser(current) };
        },
        async signOut() { current = null; sessionStorage.removeItem(KEY); },
        async sendPasswordResetEmail() {}
    };

    const query = () => ({
        orderBy() { return this; }, limit() { return this; }, where() { return this; },
        onSnapshot(cb) { setTimeout(() => cb({ docs: [], size: 0, empty: true, forEach() {} }), 5); return () => {}; }
    });
    window.staffReads = [];
    const db = {
        enablePersistence: async () => {},
        terminate: async () => {}, clearPersistence: async () => {},
        collection: name => Object.assign(query(), {
            doc: id => ({
                async get() {
                    window.staffReads.push(location.pathname);
                    const onDashboard = !location.pathname.startsWith('/admin/login');
                    if (onDashboard && setting('mockDashboardHang', '')) return new Promise(() => {});
                    await delay(Number(setting('mockReadDelay', 250)));
                    const data = name === 'admin_users' ? staff[id] : null;
                    return { exists: Boolean(data), id, data: () => data };
                },
                async set() {}, async update() {}
            })
        })
    };

    window.firebase = {
        apps: [],
        initializeApp: () => ({ auth: () => auth }),
        auth: Object.assign(() => auth, { Auth: { Persistence: { SESSION: 'session', LOCAL: 'local', NONE: 'none' } } }),
        firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'server-time' } })
    };
    window.db = db;
    window.firebaseConfig = {};
})();
