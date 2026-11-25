// Homepage "Featured products" band.
// Three tiles: details (left), product photo (centre), product list (right).
// Shows up to 5 products marked Featured in admin > Pharmacy; if none are
// featured it shows the newest in-stock products, and if the pharmacy is
// empty it shows a single "Order your medicines online" promo.
document.addEventListener('DOMContentLoaded', function () {
    const section = document.querySelector('[data-fp]');
    if (!section) return;

    const MAX = 5;
    const INTERVAL = 5000;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const stage = section.querySelector('[data-fp-stage]');
    const list = section.querySelector('[data-fp-list]');
    const el = name => section.querySelector(`[data-fp-${name}]`);

    let items = [];
    let current = 0;
    let timer = null;
    let paused = false;

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ksh = n => 'KSh ' + Number(n || 0).toLocaleString('en-US');
    const millis = t => (t && typeof t.toMillis === 'function') ? t.toMillis() : 0;

    const PROMO = {
        id: null,
        promo: true,
        name: 'Order your medicines online',
        category: 'Pharmacy',
        description: 'Genuine medicines delivered to your door. We confirm every order by phone.',
        imageUrl: 'images/Pharmacy.webp'
    };

    items = [PROMO];
    build();

    if (typeof db !== 'undefined') {
        let all = [];
        const pick = () => {
            const inStock = p => (window.MicroafiaStock ? window.MicroafiaStock.available(p) : p.inStock !== false);
            const available = all.filter(inStock);
            const featured = available.filter(p => p.featured)
                .sort((a, b) => millis(a.featuredAt) - millis(b.featuredAt) || String(a.name).localeCompare(String(b.name)));
            const newest = available.slice().sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
            const picked = (featured.length ? featured : newest).slice(0, MAX);
            items = picked.length ? picked : [PROMO];
            build();
        };
        // Re-pick when staff change the stock rules (e.g. "out of stock below 5")
        if (window.MicroafiaStock) window.MicroafiaStock.watch(() => { if (all.length) pick(); });
        db.collection('pharmacy_products').where('active', '==', true).onSnapshot(snap => {
            all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            pick();
        }, err => {
            console.warn('Featured products unavailable:', err.code || err.message);
            items = [PROMO];
            build();
        });
    }

    function imgHtml(p) {
        return p.imageUrl
            ? `<img src="${esc(p.imageUrl)}" alt=""${p.promo ? ' class="is-photo"' : ''} width="700" height="467" loading="lazy" decoding="async">`
            : '<i class="fas fa-capsules" aria-hidden="true"></i>';
    }

    function badgeHtml(p) {
        if (p.promo) return '<i class="fas fa-truck-fast"></i> Delivery available';
        if (p.requiresPrescription) return '<i class="fas fa-file-prescription"></i> Prescription required';
        return '<i class="fas fa-circle-check"></i> In stock';
    }

    function build() {
        stop();
        section.hidden = false;
        if (current >= items.length) current = 0;
        const many = items.length > 1;

        stage.innerHTML = items.map((p, i) => `
            <article class="fp-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${items.length}: ${esc(p.name)}" aria-hidden="true">
                <div class="fp-slide-img">${imgHtml(p)}</div>
                <div class="fp-slide-body">
                    <span class="fp-badge${p.requiresPrescription ? ' is-rx' : ''}">${badgeHtml(p)}</span>
                    <h3>${esc(p.name)}</h3>
                </div>
            </article>
        `).join('');

        // Right tile: clickable product list, or three short promises for the promo
        list.classList.toggle('is-points', !many);
        list.innerHTML = many
            ? items.map((p, i) => `
                <button type="button" class="fp-item" data-fp-go="${i}">
                    <span class="fp-item-img">${imgHtml(p)}</span>
                    <span class="fp-item-text"><strong>${esc(p.name)}</strong><small>${ksh(p.price)}</small></span>
                    <span class="fp-item-bar" aria-hidden="true"></span>
                </button>`).join('')
            : `
                <div class="fp-point"><i class="fas fa-shield-halved"></i><span><strong>Genuine medicines</strong><small>Quality-assured products</small></span></div>
                <div class="fp-point"><i class="fas fa-phone-alt"></i><span><strong>Confirmed by phone</strong><small>Before anything is sent</small></span></div>
                <div class="fp-point"><i class="fas fa-truck-fast"></i><span><strong>To your door</strong><small>Delivered where you are</small></span></div>`;

        show(current, true);
        start();
    }

    function show(index, instant) {
        current = (index + items.length) % items.length;
        const p = items[current];

        stage.querySelectorAll('.fp-slide').forEach((s, i) => {
            s.classList.toggle('is-active', i === current);
            s.setAttribute('aria-hidden', i === current ? 'false' : 'true');
        });
        list.querySelectorAll('.fp-item').forEach((b, i) => {
            b.classList.toggle('is-active', i === current);
            b.setAttribute('aria-current', i === current ? 'true' : 'false');
        });

        const info = el('details');
        if (!instant && !reduceMotion) {
            info.classList.remove('is-changing');
            void info.offsetWidth;                 // restart the fade
            info.classList.add('is-changing');
        }

        el('cat').textContent = p.category || 'Pharmacy';
        el('name').textContent = p.name || '';
        info.classList.toggle('is-rx', !!p.requiresPrescription);
        el('desc').textContent = p.description || 'Quality-assured and available for delivery to your door.';
        el('price').textContent = p.promo ? '' : ksh(p.price);
        el('price').hidden = !!p.promo;

        const order = el('order');
        const arrow = ' <i class="fas fa-arrow-right" aria-hidden="true"></i>';
        if (p.promo) {
            order.href = '/pharmacy';
            order.innerHTML = 'Shop pharmacy' + arrow;
            order.removeAttribute('aria-label');
        } else {
            // Opens the product's page in the pharmacy (details, price, add to cart)
            order.href = '/pharmacy?product=' + encodeURIComponent(p.id);
            order.innerHTML = 'View in pharmacy' + arrow;
            order.setAttribute('aria-label', `View ${p.name} in the pharmacy`);
        }
    }

    // ---------- autoplay ----------
    function start() {
        stop();
        if (reduceMotion || items.length < 2 || paused) return;
        section.style.setProperty('--fp-interval', INTERVAL + 'ms');
        section.classList.add('is-playing');
        timer = setInterval(() => show(current + 1), INTERVAL);
    }

    function stop() {
        clearInterval(timer);
        timer = null;
        section.classList.remove('is-playing');
    }

    function restart() { if (!paused) start(); }

    // Pause while a mouse is over the band (touch taps shouldn't freeze it)
    section.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { paused = true; stop(); } });
    section.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { paused = false; start(); } });
    section.addEventListener('focusin', () => { paused = true; stop(); });
    section.addEventListener('focusout', e => {
        if (!section.contains(e.relatedTarget)) { paused = false; start(); }
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : restart()));

    // ---------- controls ----------
    list.addEventListener('click', e => {
        const item = e.target.closest('[data-fp-go]');
        if (item) { show(Number(item.dataset.fpGo)); restart(); }
    });
    section.addEventListener('keydown', e => {
        if (e.target.matches('input, textarea')) return;
        if (e.key === 'ArrowLeft') show(current - 1);
        if (e.key === 'ArrowRight') show(current + 1);
    });

    // Swipe on touch screens
    let startX = null;
    stage.addEventListener('pointerdown', e => { startX = e.clientX; });
    stage.addEventListener('pointerup', e => {
        if (startX === null) return;
        const dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 40) { show(current + (dx < 0 ? 1 : -1)); restart(); }
    });
});
