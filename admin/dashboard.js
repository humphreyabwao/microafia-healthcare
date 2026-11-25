/* ========================================
   Admin dashboard - live statistics
   Listens to Firestore in real time and redraws hand-built SVG charts.
   Only subscribes to the modules the signed-in staff member may view.
   ======================================== */
(function () {
    'use strict';

    // Fixed series order = colour order (validated for colour-blind separation).
    const SERIES = [
        { key: 'appointments', label: 'Appointments', color: '#0d9488', href: '/admin/appointments.html' },
        { key: 'lab',          label: 'Lab orders',   color: '#eb6834', href: '/admin/lab-orders.html' },
        { key: 'pharmacy',     label: 'Pharmacy',     color: '#2a78d6', href: '/admin/pharmacy.html' },
        { key: 'wellness',     label: 'Wellness',     color: '#eda100', href: '/admin/wellness.html' },
        { key: 'enquiries',    label: 'Enquiries',    color: '#e87ba4', href: '/admin/messages.html' }
    ];
    const SERIES_BY_KEY = Object.fromEntries(SERIES.map(s => [s.key, s]));
    const VALUE_COLOR = '#064e3b';   // single-measure bars (not a series identity)

    const SOURCES = [
        { col: 'appointments', module: 'appointments', series: 'appointments', kind: 'Appointment',
          href: '/admin/appointments.html', open: ['pending'], openLabel: 'appointments to confirm',
          name: d => [d.firstName, d.lastName].filter(Boolean).join(' ') || d.name,
          detail: d => d.serviceName || d.service },
        { col: 'lab_orders', module: 'lab-orders', series: 'lab', kind: 'Lab order',
          href: '/admin/lab-orders.html', open: ['pending', 'new', 'submitted'], openLabel: 'lab orders waiting',
          name: d => d.customerName || d.name,
          detail: d => (d.tests || []).map(t => (t && t.name) || t).filter(Boolean).join(', '),
          value: d => Number(d.total) || 0,
          items: d => (d.tests || []).map(t => (t && t.name) || t).filter(x => typeof x === 'string') },
        { col: 'pharmacy_orders', module: 'pharmacy', series: 'pharmacy', kind: 'Pharmacy order',
          href: '/admin/pharmacy.html', open: ['pending'], openLabel: 'deliveries to confirm',
          name: d => d.customerName,
          detail: d => (d.items || []).map(i => i && i.name).filter(Boolean).join(', ') || d.requestType,
          value: d => Number(d.subtotal) || 0 },
        { col: 'wellness_bookings', module: 'wellness', series: 'wellness', kind: 'Wellness booking',
          href: '/admin/wellness.html', open: ['pending'], openLabel: 'wellness bookings to confirm',
          name: d => d.fullName || d.name,
          detail: d => d.packageName || d.package },
        { col: 'contact_messages', module: 'messages', series: 'enquiries', kind: 'Message',
          href: '/admin/messages.html', open: ['unread', ''], openLabel: 'unread messages',
          name: d => d.name, detail: d => d.message },
        { col: 'callback_requests', module: 'callbacks', series: 'enquiries', kind: 'Callback',
          href: '/admin/callbacks.html', open: ['pending', ''], openLabel: 'callbacks to return',
          name: d => d.name, detail: d => d.phone ? 'Asked for a call back' : '' },
        { col: 'bloodline_applications', module: 'bloodline', series: null, kind: 'Bloodline application',
          href: '/admin/bloodline.html', open: ['new'], openLabel: 'new Bloodline applications',
          name: d => d.fullName, detail: d => d.testType }
    ];

    const STATUS_GROUPS = [
        { label: 'Open',        match: ['pending', 'new', 'unread', 'submitted', ''] },
        { label: 'In progress', match: ['confirmed', 'contacted', 'shortlisted', 'processing', 'read', 'in-progress',
                                        'in_progress', 'scheduled', 'dispatched', 'out-for-delivery', 'tested', 'sample-collected'] },
        { label: 'Completed',   match: ['completed', 'delivered', 'featured', 'done', 'replied', 'called', 'resolved'] },
        { label: 'Cancelled',   match: ['cancelled', 'canceled', 'declined', 'rejected'] }
    ];

    const DAY = 86400000;
    const state = { range: 30, docs: {}, allowed: [], errors: {}, lastUpdate: null, hidden: new Set() };
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = n => Math.round(n).toLocaleString('en-KE');
    const money = n => 'KSh ' + fmt(n);
    const compactMoney = n => n >= 1e6 ? 'KSh ' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
        : n >= 1e3 ? 'KSh ' + (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : money(n);
    const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const dayLabel = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    // ---------- wait for admin.js to finish the permission check ----------
    function whenReady(cb) {
        const go = () => {
            const user = typeof getCurrentUserData === 'function' ? getCurrentUserData() : null;
            if (user && document.body.classList.contains('permissions-loaded')) { cb(user); return true; }
            return false;
        };
        if (go()) return;
        const mo = new MutationObserver(() => { if (go()) mo.disconnect(); });
        mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    function allowedModules(user) {
        if (['admin', 'super_admin'].includes(user.role)) return SOURCES.map(s => s.module);
        return Array.isArray(user.modules) ? user.modules : [];
    }

    // ---------- live listeners ----------
    function subscribe() {
        SOURCES.forEach(src => {
            if (!state.allowed.includes(src.module)) return;
            state.docs[src.col] = [];
            db.collection(src.col).orderBy('createdAt', 'desc').limit(3000).onSnapshot(snap => {
                state.docs[src.col] = snap.docs.map(doc => {
                    const d = doc.data({ serverTimestamps: 'estimate' });
                    const t = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : new Date();
                    return { id: doc.id, t, status: String(d.status || '').toLowerCase(), d };
                });
                delete state.errors[src.col];
                state.lastUpdate = new Date();
                schedule();
            }, err => {
                console.error('Dashboard listener failed for', src.col, err.code || err.message);
                state.errors[src.col] = true;
                schedule();
            });
        });
    }

    let queued = false;
    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; render(); });
    }

    // ---------- aggregation ----------
    function sourcesInSeries() {
        return SOURCES.filter(s => s.series && state.docs[s.col]);
    }
    function activeSeries() {
        const keys = new Set(sourcesInSeries().map(s => s.series));
        return SERIES.filter(s => keys.has(s.key));
    }
    function windowFor(offset) {   // offset 0 = current range, 1 = previous range
        const end = new Date(startOfDay(new Date()).getTime() + DAY - offset * state.range * DAY);
        return { start: new Date(end.getTime() - state.range * DAY), end };
    }
    function rowsIn(src, w) {
        return (state.docs[src.col] || []).filter(r => r.t >= w.start && r.t < w.end);
    }

    function buildBuckets() {
        const w = windowFor(0);
        const weekly = state.range > 45;
        const step = weekly ? 7 * DAY : DAY;
        const buckets = [];
        for (let t = w.start.getTime(); t < w.end.getTime(); t += step) {
            buckets.push({ start: new Date(t), end: new Date(Math.min(t + step, w.end.getTime())) });
        }
        return { w, weekly, buckets };
    }

    function statusGroup(status) {
        const g = STATUS_GROUPS.find(g => g.match.includes(status));
        return g ? g.label : 'Other';
    }

    // ---------- render ----------
    function render() {
        renderLive();
        renderKpis();
        renderLine();
        renderDonut();
        renderValueBars();
        renderStatus();
        renderTopTests();
        renderAttention();
        renderActivity();
    }

    function renderLive() {
        // Updates run quietly in the background; failures are only logged
        const el = $('dbUpdated');
        if (!el) return;
        const failed = Object.keys(state.errors).length;
        if (failed) {
            el.textContent = 'Some data could not load';
            el.parentElement.classList.add('is-error');
        } else if (state.lastUpdate) {
            el.textContent = 'Live · updated ' + state.lastUpdate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            el.parentElement.classList.remove('is-error');
        }
    }

    function delta(cur, prev) {
        if (!prev && !cur) return { text: 'No activity yet', cls: 'flat' };
        if (!prev) return { text: 'New this period', cls: 'up' };
        const pct = Math.round((cur - prev) / prev * 100);
        if (pct === 0) return { text: 'Same as previous ' + state.range + ' days', cls: 'flat' };
        return { text: (pct > 0 ? '▲ +' : '▼ ') + pct + '% vs previous ' + state.range + ' days', cls: pct > 0 ? 'up' : 'down' };
    }

    function renderKpis() {
        const cur = windowFor(0), prev = windowFor(1);
        const tiles = [];
        const srcs = sourcesInSeries();
        if (srcs.length) {
            const c = srcs.reduce((n, s) => n + rowsIn(s, cur).length, 0);
            const p = srcs.reduce((n, s) => n + rowsIn(s, prev).length, 0);
            tiles.push({ label: 'All requests', value: fmt(c), delta: delta(c, p), lead: true });
        }
        ['appointments', 'lab_orders', 'pharmacy_orders'].forEach(col => {
            const src = SOURCES.find(s => s.col === col);
            if (!state.docs[col]) return;
            const c = rowsIn(src, cur).length, p = rowsIn(src, prev).length;
            tiles.push({ label: SERIES_BY_KEY[src.series].label, value: fmt(c), delta: delta(c, p), color: SERIES_BY_KEY[src.series].color });
        });
        const valued = SOURCES.filter(s => s.value && state.docs[s.col]);
        if (valued.length) {
            const sum = w => valued.reduce((n, s) => n + rowsIn(s, w).reduce((m, r) => m + s.value(r.d), 0), 0);
            const c = sum(cur), p = sum(prev);
            tiles.push({ label: 'Order value', value: compactMoney(c), title: money(c), delta: delta(c, p) });
        }
        $('dbKpis').innerHTML = tiles.map(t => `
            <div class="db-kpi${t.lead ? ' db-kpi--lead' : ''}">
                <p class="db-kpi-label">${t.color ? `<span class="db-swatch" style="background:${t.color}"></span>` : ''}${esc(t.label)}</p>
                <p class="db-kpi-value"${t.title ? ` title="${esc(t.title)}"` : ''}>${esc(t.value)}</p>
                <p class="db-kpi-delta ${t.delta.cls}">${esc(t.delta.text)}</p>
            </div>`).join('');
        $('dbRangeNote').textContent = state.range === 7 ? 'Last 7 days' : `Last ${state.range} days`;
    }

    // ----- shared SVG helpers -----
    function niceMax(v) {
        if (v <= 4) return 4;
        const p = Math.pow(10, Math.floor(Math.log10(v)));
        const n = v / p;
        return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    }
    function tooltip(card) {
        let tip = card.querySelector('.db-tip');
        if (!tip) { tip = document.createElement('div'); tip.className = 'db-tip'; tip.hidden = true; card.appendChild(tip); }
        return {
            show(html, x, y) {
                tip.innerHTML = html; tip.hidden = false;
                const cw = card.clientWidth, tw = tip.offsetWidth;
                tip.style.left = Math.max(8, Math.min(cw - tw - 8, x - tw / 2)) + 'px';
                tip.style.top = Math.max(8, y - tip.offsetHeight - 12) + 'px';
            },
            hide() { tip.hidden = true; }
        };
    }
    function emptyState(el, text) {
        el.innerHTML = `<div class="db-empty">${esc(text)}</div>`;
    }
    function relPos(evt, el) {
        const r = el.getBoundingClientRect();
        return { x: evt.clientX - r.left, y: evt.clientY - r.top };
    }

    // ----- line chart: requests per day by channel -----
    function renderLine() {
        const host = $('lineChart'), card = host.closest('.db-card');
        const series = activeSeries();
        if (!series.length) { emptyState(host, 'No request data you can view.'); $('lineLegend').innerHTML = ''; return; }
        const { w, weekly, buckets } = buildBuckets();
        const step = weekly ? 7 * DAY : DAY;
        const dayBuckets = buckets.map(b => b.start);
        $('lineTitle').textContent = weekly ? 'Requests per week' : 'Requests per day';
        const values = {};
        series.forEach(s => { values[s.key] = dayBuckets.map(() => 0); });
        sourcesInSeries().forEach(src => rowsIn(src, w).forEach(r => {
            const i = Math.floor((r.t - w.start) / step);
            if (i >= 0 && i < dayBuckets.length) values[src.series][i]++;
        }));
        const totals = Object.fromEntries(series.map(s => [s.key, values[s.key].reduce((a, b) => a + b, 0)]));
        $('lineLegend').innerHTML = series.map(s =>
            `<button type="button" class="db-legend-item" data-key="${s.key}" aria-pressed="${!state.hidden.has(s.key)}" title="Show or hide ${esc(s.label)}"><span class="db-line-key" style="background:${s.color}"></span>${esc(s.label)} <b>${fmt(totals[s.key])}</b></button>`).join('');
        $('lineLegend').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
            const k = b.dataset.key;
            if (state.hidden.has(k)) state.hidden.delete(k);
            else if (series.filter(s => !state.hidden.has(s.key)).length > 1) state.hidden.add(k);
            renderLine();
        }));
        const shown = series.filter(s => !state.hidden.has(s.key));

        const W = Math.max(280, host.clientWidth), H = host.clientWidth < 520 ? 230 : 320;
        const m = { t: 12, r: 12, b: 28, l: 34 };
        const iw = W - m.l - m.r, ih = H - m.t - m.b;
        const max = niceMax(Math.max(1, ...shown.flatMap(s => values[s.key])));
        const n = dayBuckets.length;
        const x = i => m.l + (n === 1 ? iw / 2 : i / (n - 1) * iw);
        const y = v => m.t + ih - v / max * ih;
        const ticks = [0, max / 4, max / 2, max * 3 / 4, max];
        const labelEvery = Math.ceil(n / Math.max(2, Math.floor(iw / 70)));

        let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Requests per day by channel">`;
        ticks.forEach(t => {
            svg += `<line class="db-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
            svg += `<text class="db-axis" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${Number.isInteger(t) ? t : t.toFixed(1)}</text>`;
        });
        dayBuckets.forEach((d, i) => {
            if ((n - 1 - i) % labelEvery === 0) svg += `<text class="db-axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${dayLabel(d)}</text>`;
        });
        shown.forEach(s => {
            const pts = values[s.key].map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
            svg += `<polyline class="db-line" points="${pts}" stroke="${s.color}"/>`;
        });
        svg += `<line class="db-cross" id="lineCross" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/>`;
        svg += `<g id="lineDots"></g>`;
        svg += `<rect class="db-hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}"/>`;
        svg += '</svg>';
        host.innerHTML = svg;

        const tip = tooltip(card), cross = host.querySelector('#lineCross'), dots = host.querySelector('#lineDots');
        const hit = host.querySelector('.db-hit');
        const move = evt => {
            const p = relPos(evt, host.querySelector('svg'));
            const i = Math.max(0, Math.min(n - 1, Math.round((p.x - m.l) / (iw / Math.max(1, n - 1)))));
            cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
            dots.innerHTML = shown.map(s => `<circle class="db-dot" cx="${x(i)}" cy="${y(values[s.key][i])}" r="4.5" fill="${s.color}"/>`).join('');
            const rows = shown.map(s => `<div class="db-tip-row"><span class="db-line-key" style="background:${s.color}"></span>${esc(s.label)}<b>${values[s.key][i]}</b></div>`).join('');
            const hostOffset = host.offsetTop;
            const title = weekly ? 'Week of ' + dayLabel(dayBuckets[i]) : dayBuckets[i].toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
            tip.show(`<div class="db-tip-title">${title}</div>${rows}`,
                host.offsetLeft + x(i), hostOffset + 10 + Math.min(...shown.map(s => y(values[s.key][i]))));
        };
        hit.addEventListener('pointermove', move);
        hit.addEventListener('pointerleave', () => { tip.hide(); cross.setAttribute('visibility', 'hidden'); dots.innerHTML = ''; });
    }

    // ----- donut: request mix -----
    function renderDonut() {
        const host = $('donutChart'), card = host.closest('.db-card');
        const w = windowFor(0);
        const series = activeSeries();
        const counts = series.map(s => ({ s, n: sourcesInSeries().filter(src => src.series === s.key).reduce((a, src) => a + rowsIn(src, w).length, 0) }));
        const total = counts.reduce((a, c) => a + c.n, 0);
        if (!total) { emptyState(host, 'No requests in this period yet.'); return; }

        const size = 200, r = 84, inner = 58, cx = size / 2, cy = size / 2;
        let a0 = -Math.PI / 2;
        const arcs = counts.filter(c => c.n).map(c => {
            const a1 = a0 + c.n / total * Math.PI * 2;
            const seg = { ...c, a0, a1 }; a0 = a1; return seg;
        });
        const pt = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
        const path = s => {
            if (s.a1 - s.a0 >= Math.PI * 2 - 1e-6) {
                return `M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0` +
                       `M${cx - inner},${cy}a${inner},${inner} 0 1,1 ${inner * 2},0a${inner},${inner} 0 1,1 ${-inner * 2},0Z`;
            }
            const large = s.a1 - s.a0 > Math.PI ? 1 : 0;
            const [x0, y0] = pt(r, s.a0), [x1, y1] = pt(r, s.a1), [x2, y2] = pt(inner, s.a1), [x3, y3] = pt(inner, s.a0);
            return `M${x0},${y0}A${r},${r} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${inner},${inner} 0 ${large} 0 ${x3},${y3}Z`;
        };
        let svg = `<svg viewBox="0 0 ${size} ${size}" class="db-donut-svg" role="img" aria-label="Share of requests by channel">`;
        arcs.forEach((s, i) => { svg += `<path class="db-seg" data-i="${i}" d="${path(s)}" fill="${s.s.color}" fill-rule="evenodd"/>`; });
        svg += `<text class="db-donut-total" x="${cx}" y="${cy + 2}" text-anchor="middle">${fmt(total)}</text>`;
        svg += `<text class="db-donut-sub" x="${cx}" y="${cy + 22}" text-anchor="middle">requests</text></svg>`;
        const legend = counts.map(c => `
            <li><span class="db-swatch" style="background:${c.s.color}"></span><span class="db-donut-name">${esc(c.s.label)}</span>
            <span class="db-donut-n">${fmt(c.n)}</span><span class="db-donut-pct">${total ? Math.round(c.n / total * 100) : 0}%</span></li>`).join('');
        host.innerHTML = `<div class="db-donut">${svg}<ul class="db-donut-legend">${legend}</ul></div>`;

        const tip = tooltip(card);
        host.querySelectorAll('.db-seg').forEach(el => {
            const s = arcs[+el.dataset.i];
            el.addEventListener('pointermove', evt => {
                host.querySelector('svg').classList.add('is-hover'); el.classList.add('is-on');
                const p = relPos(evt, card);
                tip.show(`<div class="db-tip-title">${esc(s.s.label)}</div><div class="db-tip-row">${fmt(s.n)} requests<b>${Math.round(s.n / total * 100)}%</b></div>`, p.x, p.y);
            });
            el.addEventListener('pointerleave', () => { tip.hide(); el.classList.remove('is-on'); host.querySelector('svg').classList.remove('is-hover'); });
        });
    }

    // ----- vertical bars: order value per day / week -----
    function renderValueBars() {
        const host = $('valueChart'), card = host.closest('.db-card');
        const valued = SOURCES.filter(s => s.value && state.docs[s.col]);
        if (!valued.length) { card.hidden = true; return; }
        card.hidden = false;
        const { weekly, buckets } = buildBuckets();
        $('valueSub').textContent = (weekly ? 'Per week' : 'Per day') + ' · lab + pharmacy, KSh';
        const vals = buckets.map(b => valued.reduce((n, s) =>
            n + (state.docs[s.col] || []).filter(r => r.t >= b.start && r.t < b.end).reduce((m, r) => m + s.value(r.d), 0), 0));
        if (!vals.some(Boolean)) { emptyState(host, 'No orders with a value in this period yet.'); return; }

        const W = Math.max(280, host.clientWidth), H = 220;
        const m = { t: 18, r: 8, b: 26, l: 46 };
        const iw = W - m.l - m.r, ih = H - m.t - m.b;
        const max = niceMax(Math.max(...vals));
        const n = vals.length, slot = iw / n, bw = Math.max(2, Math.min(28, slot - 2));
        const y = v => m.t + ih - v / max * ih;
        const peak = vals.indexOf(Math.max(...vals));
        const labelEvery = Math.ceil(n / Math.max(2, Math.floor(iw / 64)));
        let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Order value over time">`;
        [0, max / 2, max].forEach(t => {
            svg += `<line class="db-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
            svg += `<text class="db-axis" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${compactMoney(t).replace('KSh ', '')}</text>`;
        });
        vals.forEach((v, i) => {
            const x0 = m.l + i * slot + (slot - bw) / 2, h = Math.max(v ? 2 : 0, ih - (y(v) - m.t));
            const rr = Math.min(4, bw / 2, h);
            if (h > 0) svg += `<path class="db-bar" data-i="${i}" fill="${VALUE_COLOR}" d="M${x0},${m.t + ih}V${m.t + ih - h + rr}q0,-${rr} ${rr},-${rr}h${bw - 2 * rr}q${rr},0 ${rr},${rr}V${m.t + ih}Z"/>`;
            svg += `<rect class="db-hit db-bar-hit" data-i="${i}" x="${m.l + i * slot}" y="${m.t}" width="${slot}" height="${ih}"/>`;
            if ((n - 1 - i) % labelEvery === 0) svg += `<text class="db-axis" x="${x0 + bw / 2}" y="${H - 8}" text-anchor="middle">${dayLabel(buckets[i].start)}</text>`;
        });
        const px = m.l + peak * slot + slot / 2;
        svg += `<text class="db-peak" x="${Math.min(W - m.r - 30, Math.max(m.l + 30, px))}" y="${y(vals[peak]) - 6}" text-anchor="middle">${compactMoney(vals[peak])}</text>`;
        svg += '</svg>';
        host.innerHTML = svg;

        const tip = tooltip(card);
        host.querySelectorAll('.db-bar-hit').forEach(el => {
            const i = +el.dataset.i;
            el.addEventListener('pointermove', () => {
                host.querySelectorAll('.db-bar').forEach(b => b.classList.toggle('is-dim', +b.dataset.i !== i));
                const b = buckets[i];
                const title = weekly ? `${dayLabel(b.start)} – ${dayLabel(new Date(b.end - 1))}` : b.start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                tip.show(`<div class="db-tip-title">${title}</div><div class="db-tip-row">Order value<b>${money(vals[i])}</b></div>`,
                    host.offsetLeft + m.l + i * slot + slot / 2, host.offsetTop + y(vals[i]));
            });
            el.addEventListener('pointerleave', () => { tip.hide(); host.querySelectorAll('.db-bar').forEach(b => b.classList.remove('is-dim')); });
        });
    }

    // ----- horizontal bars (status, top tests) -----
    function hbars(host, rows, unit) {
        const card = host.closest('.db-card');
        const max = Math.max(1, ...rows.map(r => r.n));
        host.innerHTML = `<ul class="db-hbars">${rows.map((r, i) => `
            <li data-i="${i}">
                <span class="db-hbar-label" title="${esc(r.label)}">${esc(r.label)}</span>
                <span class="db-hbar-track"><span class="db-hbar-fill" style="width:${r.n ? Math.max(2, r.n / max * 100) : 0}%"></span></span>
                <span class="db-hbar-n">${fmt(r.n)}</span>
            </li>`).join('')}</ul>`;
        const tip = tooltip(card);
        host.querySelectorAll('li').forEach(li => {
            const r = rows[+li.dataset.i];
            li.addEventListener('pointermove', evt => {
                const p = relPos(evt, card);
                tip.show(`<div class="db-tip-title">${esc(r.label)}</div><div class="db-tip-row">${esc(unit)}<b>${fmt(r.n)}${r.pct != null ? ` · ${r.pct}%` : ''}</b></div>`, p.x, p.y);
            });
            li.addEventListener('pointerleave', () => tip.hide());
        });
    }

    function renderStatus() {
        const host = $('statusChart');
        const w = windowFor(0);
        const rows = SOURCES.filter(s => state.docs[s.col]).flatMap(s => rowsIn(s, w));
        if (!rows.length) { emptyState(host, 'No requests in this period yet.'); return; }
        const groups = [...STATUS_GROUPS.map(g => g.label), 'Other'];
        const counts = groups.map(label => ({ label, n: rows.filter(r => statusGroup(r.status) === label).length }))
            .filter(r => r.label !== 'Other' || r.n);
        counts.forEach(r => { r.pct = Math.round(r.n / rows.length * 100); });
        hbars(host, counts, 'Requests');
    }

    function renderTopTests() {
        const host = $('testsChart'), card = host.closest('.db-card');
        const lab = SOURCES.find(s => s.col === 'lab_orders');
        if (!state.docs.lab_orders) { card.hidden = true; return; }
        card.hidden = false;
        const tally = new Map();
        rowsIn(lab, windowFor(0)).forEach(r => lab.items(r.d).forEach(name => tally.set(name, (tally.get(name) || 0) + 1)));
        const rows = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, n]) => ({ label, n }));
        if (!rows.length) { emptyState(host, 'No lab tests ordered in this period yet.'); return; }
        hbars(host, rows, 'Times ordered');
    }

    function renderAttention() {
        const items = SOURCES.filter(s => state.docs[s.col]).map(s => ({
            s, n: state.docs[s.col].filter(r => s.open.includes(r.status)).length
        }));
        const pending = items.filter(i => i.n);
        $('attentionList').innerHTML = pending.length
            ? pending.sort((a, b) => b.n - a.n).map(i => `
                <li><a href="${i.s.href}"><span class="db-att-n">${fmt(i.n)}</span><span class="db-att-label">${esc(i.s.openLabel)}</span><i class="fas fa-chevron-right" aria-hidden="true"></i></a></li>`).join('')
            : '<li class="db-att-clear">All caught up - nothing waiting.</li>';
    }

    function timeAgo(t) {
        const s = Math.floor((Date.now() - t) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + ' min ago';
        if (s < 86400) return Math.floor(s / 3600) + ' h ago';
        if (s < 604800) return Math.floor(s / 86400) + ' d ago';
        return dayLabel(t);
    }

    function renderActivity() {
        const rows = SOURCES.filter(s => state.docs[s.col])
            .flatMap(s => state.docs[s.col].slice(0, 10).map(r => ({ s, r })))
            .sort((a, b) => b.r.t - a.r.t).slice(0, 8);
        $('activityList').innerHTML = rows.length ? rows.map(({ s, r }) => {
            const color = s.series ? SERIES_BY_KEY[s.series].color : '#9ca3af';
            const detail = String(s.detail(r.d) || '').slice(0, 80);
            return `<li><a href="${s.href}">
                <span class="db-act-dot" style="background:${color}"></span>
                <span class="db-act-main"><span class="db-act-name">${esc(s.name(r.d) || 'Unknown')}</span>
                <span class="db-act-detail">${esc(s.kind)}${detail ? ' · ' + esc(detail) : ''}</span></span>
                <span class="status-badge ${esc(r.status || 'pending')}">${esc(r.status || 'new')}</span>
                <span class="db-act-time">${timeAgo(r.t)}</span></a></li>`;
        }).join('') : '<li class="db-empty">No activity yet.</li>';
    }

    // ---------- controls ----------
    function initControls() {
        document.querySelectorAll('[data-range]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.range = +btn.dataset.range;
                document.querySelectorAll('[data-range]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
                render();
            });
        });
        let rt;
        new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(schedule, 120); }).observe($('lineChart'));
        // keep "x min ago" fresh
        setInterval(() => { if (state.lastUpdate) renderActivity(); }, 60000);
    }

    function greet(user) {
        const h = new Date().getHours();
        const first = String(user.firstName || user.name || '').split(' ')[0];
        $('dbGreeting').textContent = (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + (first ? ', ' + first : '');
        $('dbToday').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!$('dbKpis') || typeof db === 'undefined') return;
        initControls();
        whenReady(user => {
            state.allowed = allowedModules(user);
            greet(user);
            subscribe();
            if (!SOURCES.some(s => state.allowed.includes(s.module))) render();
        });
    });

    // exposed for tests
    window.__dashboard = { state, render, statusGroup };
})();
