const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function authorize({ exists = false, claims = {}, fail = false, status = 'active', pathname = '/admin/', role = 'admin', modules = ['dashboard'], hang = false, cached = null } = {}) {
    let callback;
    const state = { writes: 0, signedOut: false, loaded: false, reloaded: false };
    const actions = {};
    const overlay = { classList: { add() {}, remove() {} }, remove() {}, setAttribute() {}, set innerHTML(value) { state.errorHTML = value; } };
    const auth = { onAuthStateChanged(fn) { callback = fn; }, async signOut() { state.signedOut = true; } };
    const store = new Map(cached ? [['mf_admin_profile', JSON.stringify(cached)]] : []);
    const sessionStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
    const location = { href: '', pathname, origin: 'http://localhost', reload() { state.reloaded = true; }, replace(url) { this.href = url; } };
    const window = { location, addEventListener() {} };
    const context = {
        window, sessionStorage, console: { log() {}, error() {}, warn() {} }, alert() {}, setTimeout(fn, delay) { if (hang && delay === 8000) queueMicrotask(fn); }, clearTimeout() {}, URL,
        document: { addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; }, getElementById(id) {
            if (id === 'permissionsLoading') return overlay;
            if (['retryStaffAccess', 'signOutStaffAccess'].includes(id)) return { addEventListener(_, fn) { actions[id] = fn; } };
            return null;
        },
            body: { classList: { add(name) { if (name === 'permissions-loaded') state.loaded = true; } } } },
        firebase: { auth: () => auth, firestore: { FieldValue: { serverTimestamp: () => 'time' } } },
        db: { collection: () => ({ doc: () => ({
            async get(options) {
                assert.equal(options.source, 'server');
                if (hang) return new Promise(() => {});
                if (fail) throw Object.assign(new Error('lookup failed'), { code: fail === 'denied' ? 'permission-denied' : 'unavailable' });
                return { exists, id: 'staff', data: () => ({ status, role, modules }) };
            },
            async set() { state.writes++; }
        }) }) }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../admin/admin.js'), 'utf8'), context);
    await callback({ uid: 'staff', email: 'staff@example.com', getIdTokenResult: async () => ({ claims }) });
    return { ...state, href: window.location.href, actions, notice: store.get('mf_login_notice'), cachedAfter: store.get('mf_admin_profile') };
}

test('an authenticated account cannot promote itself without a staff record', async () => {
    const result = await authorize();
    assert.equal(result.writes, 0);
    assert(result.signedOut);
    assert.equal(result.loaded, false);
    assert.equal(result.href, '/admin/login.html');
    assert.match(result.notice, /not set up for the staff dashboard/, 'login page explains why instead of a silent bounce');
});
test('existing active staff keep dashboard access', async () => {
    const result = await authorize({ exists: true });
    assert(result.loaded);
    assert.equal(result.writes, 0);
    assert.equal(result.signedOut, false);
    assert.equal(result.errorHTML, undefined);
});
test('trusted admin claims retain explicit bootstrap behavior', async () => {
    const result = await authorize({ claims: { admin: true } });
    assert.equal(result.writes, 1);
    assert(result.loaded, 'opens straight away (no extra reload)');
});
test('permission lookup failure never reveals the dashboard', async () => {
    const result = await authorize({ fail: true });
    assert.equal(result.loaded, false);
    assert.equal(result.href, '');
    assert.match(result.errorHTML, /Check your connection/);
    assert.equal(typeof result.actions.retryStaffAccess, 'function');
    assert.equal(typeof result.actions.signOutStaffAccess, 'function');
});
test('inactive staff are signed out with a reason', async () => {
    const result = await authorize({ exists: true, status: 'inactive' });
    assert(result.signedOut);
    assert.match(result.notice, /inactive/);
});

const profile = { id: 'staff', name: 'Staff', role: 'admin', status: 'active', modules: ['dashboard'], permissions: {} };
test('a profile verified at login opens the page immediately, then re-checks', async () => {
    const result = await authorize({ exists: true, hang: true, cached: profile });
    assert(result.loaded, 'shown from the verified profile without waiting');
    assert.equal(result.signedOut, false, 'a slow background check does not end the session');
    assert.equal(result.errorHTML, undefined);
});
test('background re-check ends the session when access was removed', async () => {
    const result = await authorize({ exists: true, status: 'inactive', cached: profile });
    assert(result.signedOut);
    assert.equal(result.href, '/admin/login.html');
});
test('background re-check ends the session when the rules deny access', async () => {
    const result = await authorize({ fail: 'denied', cached: profile });
    assert(result.signedOut);
});
test('a cached profile for another account is ignored', async () => {
    const result = await authorize({ hang: true, cached: { ...profile, id: 'someone-else' } });
    assert.equal(result.loaded, false);
    assert.match(result.errorHTML, /Try again/);
});

for (const pathname of ['/admin', '/admin/', '/admin/index', '/admin/index.html']) {
    test(`dashboard opens without a redirect loop at ${pathname}`, async () => {
        const result = await authorize({ exists: true, pathname });
        assert.equal(result.loaded, true);
        assert.equal(result.href, '');
        assert.equal(result.errorHTML, undefined);
    });
}

test('clean dashboard URL still redirects staff with no dashboard access', async () => {
    const result = await authorize({ exists: true, pathname: '/admin', role: 'staff', modules: ['appointments'] });
    assert.equal(result.loaded, false);
    assert.equal(result.href, '/admin/appointments.html');
});

test('denied staff lookup shows an actionable error without bouncing to login', async () => {
    const result = await authorize({ fail: 'denied' });
    assert.equal(result.loaded, false);
    assert.equal(result.href, '');
    assert.match(result.errorHTML, /staff account and database access/);
});

test('a stalled staff lookup stops the spinner with a retry option', async () => {
    const result = await authorize({ hang: true });
    assert.equal(result.loaded, false);
    assert.equal(result.href, '');
    assert.match(result.errorHTML, /Try again/);
});
