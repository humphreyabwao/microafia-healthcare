// Login -> dashboard journey against an in-browser Firebase stand-in.
// Run with a local dev server and playwright-core available on NODE_PATH.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mock = fs.readFileSync(path.join(__dirname, 'admin-login.mock.js'), 'utf8');
const BASE = 'http://127.0.0.1:8000';

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        async function fresh(settings = {}) {
            const context = await browser.newContext();
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.route('https://**', route => route.abort());
            await page.route('**/firebase-config.js', route => route.fulfill({ contentType: 'application/javascript', body: mock }));
            await page.addInitScript(s => { for (const [k, v] of Object.entries(s)) sessionStorage.setItem(k, v); }, settings);
            await page.goto(BASE + '/admin/login');
            return { page, context, errors };
        }
        const signIn = async (page, email, password = 'secret123') => {
            await page.locator('#email').fill(email);
            await page.locator('#password').fill(password);
            await page.locator('#loginBtn').click();
        };
        const dashboardShown = page => page.waitForFunction(() =>
            location.pathname.startsWith('/admin') && !location.pathname.includes('login') &&
            !!document.body && document.body.classList.contains('permissions-loaded'), null, { timeout: 5000 });

        // 1. Staff member: one staff check (on the login page), dashboard opens from it
        {
            const { page, context, errors } = await fresh({ mockDashboardHang: '1' });
            const t0 = Date.now();
            await signIn(page, 'staff@test.dev');
            assert.match(await page.locator('#loginBtn').innerText(), /Signing in|Opening dashboard/);
            await dashboardShown(page);
            const ms = Date.now() - t0;
            assert.equal(await page.locator('.profile-name').first().innerText(), 'Test Staff');
            assert(await page.locator('#permissionsLoading').count() === 0 || await page.locator('#permissionsLoading').evaluate(el => el.classList.contains('hidden')));
            assert.deepEqual(errors, []);
            console.log(`PASS: staff sign-in opens the dashboard in ${ms} ms (mock auth 120 ms + staff read 250 ms) without waiting on a second check`);
            await context.close();
        }

        // 2. Login with no staff record: clear message, stays signed out, no bounce
        {
            const { page, context } = await fresh();
            await signIn(page, 'nostaff@test.dev');
            await page.waitForFunction(() => document.getElementById('errorMessage').classList.contains('show'));
            assert.match(await page.locator('#errorMessage').innerText(), /not set up for the staff dashboard/);
            assert.equal(new URL(page.url()).pathname, '/admin/login');
            assert.equal(await page.evaluate(() => sessionStorage.getItem('mockUser')), null, 'signed out again');
            assert.equal(await page.locator('#loginBtn').innerText(), 'Sign in');
            console.log('PASS: account without a staff record gets a clear message instead of a silent loop');
            await context.close();
        }

        // 3. Inactive staff + wrong password
        {
            const { page, context } = await fresh();
            await signIn(page, 'inactive@test.dev');
            await page.waitForFunction(() => /inactive/.test(document.getElementById('errorMessage').textContent));
            await signIn(page, 'staff@test.dev', 'wrong-password');
            await page.waitForFunction(() => /Incorrect email or password/.test(document.getElementById('errorMessage').textContent));
            assert.equal(await page.locator('#loginBtn').isEnabled(), true);
            console.log('PASS: inactive account and wrong password show clear messages');
            await context.close();
        }

        // 4. Dashboard ends a session with a reason -> shown on the login page
        {
            const { page, context } = await fresh();
            await page.evaluate(() => {
                sessionStorage.setItem('mockUser', JSON.stringify({ uid: 'u-nostaff', email: 'nostaff@test.dev' }));
            });
            await page.goto(BASE + '/admin/');
            await page.waitForURL('**/admin/login**', { timeout: 5000 });
            await page.waitForFunction(() => document.getElementById('errorMessage').classList.contains('show'));
            assert.match(await page.locator('#errorMessage').innerText(), /not set up for the staff dashboard/);
            console.log('PASS: dashboard refusal is explained on the login page');
            await context.close();
        }

        // 5. Slow server on login: never stuck, the dashboard takes over
        {
            const { page, context } = await fresh({ mockReadDelay: '20000' });
            const t0 = Date.now();
            await signIn(page, 'staff@test.dev');
            await page.waitForURL(url => !String(url).includes('login'), { timeout: 12000 });
            const waited = Date.now() - t0;
            assert(waited < 7000, `waited ${waited} ms`);
            console.log(`PASS: a stalled staff check on login hands over to the dashboard after ${waited} ms instead of hanging`);
            await context.close();
        }

        // 6. Prefetch warms the dashboard files while typing
        {
            const { page, context } = await fresh();
            await page.waitForFunction(() => document.querySelectorAll('link[rel="prefetch"]').length >= 5, null, { timeout: 4000 });
            console.log('PASS: dashboard files are prefetched on the login page');
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
