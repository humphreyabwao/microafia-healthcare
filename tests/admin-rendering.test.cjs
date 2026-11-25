const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    const payload = '<img src=x onerror="window.__injected=1">O\'Neil & Co';
    try {
        for (const module of ['lab-orders', 'appointments', 'messages', 'admin']) {
            const page = await browser.newPage();
            await page.goto('http://127.0.0.1:8000/404.html');
            await page.setContent(`<div class="table-responsive"><table>${['labOrdersTableBody','appointmentsTableBody','messagesTableBody','recentAppointments','recentLabOrders','recentWellness'].map(id => '<tbody id="'+id+'"></tbody>').join('')}</table></div><div id="emptyState"></div><div id="viewModal"><div id="viewModalBody"></div></div><div id="recentMessages"></div>`);
            const source = fs.readFileSync(path.join(__dirname, '../admin/' + module + '.js'), 'utf8');
            await page.evaluate(ids => ids.forEach(id => {
                if (!document.getElementById(id)) { const node = document.createElement('div'); node.id = id; document.body.appendChild(node); }
            }), [...source.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1]));
            await page.addScriptTag({ content: `window.firebase = { auth: () => ({ onAuthStateChanged() {} }) }; window.formatDate = () => 'test date';` });
            await page.addScriptTag({ path: path.join(__dirname, '../admin/security.js') });
            await page.addScriptTag({ path: path.join(__dirname, '../admin/' + module + '.js') });
            await page.evaluate(({ module, payload }) => {
                if (module === 'lab-orders') {
                    labOrdersData = [{ id: 'fixture', customerName: payload, phone: payload, email: payload, notes: payload, tests: [{ name: payload, price: 1 }], status: 'pending', prescription: { url: 'javascript:alert(1)', name: payload } }];
                    renderLabOrders(); viewOrder('fixture');
                } else if (module === 'appointments') {
                    allAppointments = [{ id: 'fixture', firstName: payload, lastName: 'Test', phone: payload, service: payload, symptoms: payload, status: 'pending' }];
                    renderAppointments(); viewAppointment('fixture');
                } else if (module === 'messages') {
                    messagesData = [{ id: 'fixture', name: payload, phone: payload, email: "');window.__injected=2;//", service: payload, message: payload, status: 'read' }];
                    renderMessages(); viewMessage('fixture');
                    window.replyEmail = value => { window.__reply = value; };
                } else {
                    const snapshot = { empty: false, forEach(callback) { callback({ id: 'fixture', data: () => ({ firstName: payload, lastName: 'Test', name: payload, customerName: payload, fullName: payload, service: payload, tests: [{ name: payload }], message: payload, status: 'pending' }) }); } };
                    updateRecentAppointments(snapshot); updateRecentLabOrders(snapshot); updateRecentWellness(snapshot); updateRecentMessages(snapshot);
                }
            }, { module, payload });
            assert.equal(await page.locator('img').count(), 0, module + ' inserted an executable image');
            assert((await page.locator('body').textContent()).includes(payload), module + ' changed the visible customer text');
            assert.equal(await page.evaluate(() => window.__injected), undefined);
            if (module === 'messages') {
                await page.locator('.btn-reply').click();
                assert.equal(await page.evaluate(() => window.__reply), "');window.__injected=2;//");
                assert.equal(await page.evaluate(() => window.__injected), undefined);
            }
            if (module === 'lab-orders') assert.equal(await page.locator('.prescription-link').first().getAttribute('href'), '#');
            console.log('PASS: ' + module + ' renders customer text safely without changing names, notes or actions');
            await page.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
