// Microafia Healthcare - floating customer-care chatbot.
// Sends the conversation to /api/chat (Firebase Cloud Function -> Claude).
// If that endpoint is unavailable it answers from the built-in FAQ below,
// so the widget always gives a useful reply.
(function () {
    'use strict';

    const API_URL = '/api/chat';
    const STORE_KEY = 'mf_chat_v1';
    const TEASER_KEY = 'mf_chat_teased';
    const MAX_HISTORY = 12;
    const PHONE = '+254 740 250 696';

    const WELCOME = "Hi! I'm the Microafia assistant. Ask me about our services, prices, DNA tests, the pharmacy, booking or opening hours.";

    const CHIPS = [
        { label: 'Book an appointment', q: 'How do I book an appointment?' },
        { label: 'Lab test prices', q: 'What are your lab test prices?' },
        { label: 'DNA test cost', q: 'How much is a DNA paternity test?' },
        { label: 'Pharmacy delivery', q: 'How does pharmacy delivery work?' },
        { label: 'Hours & location', q: 'What are your opening hours and where are you located?' },
        { label: 'Talk to a person', q: 'I want to talk to a person.' }
    ];

    // ---------- built-in FAQ (used when the AI endpoint is unavailable) ----------
    const FAQ = [
        { k: ['book', 'appointment', 'consult', 'doctor', 'see a doctor', 'daktari', 'miadi'],
          a: 'You can book online in about a minute: choose a service, date and time and we\'ll confirm by phone.\n\n[Book an appointment](/book-appointment)' },
        { k: ['hour', 'open', 'close', 'time', 'saa', 'when are you'],
          a: 'We\'re **open daily, 8 AM - 9 PM**.\n\n[Find us](/#find-us)' },
        { k: ['where', 'location', 'locat', 'address', 'direction', 'find you', 'zambezi', 'map'],
          a: 'We\'re at **KK Place Building, Zambezi Town** (near Nairobi).\n\n[Get directions](https://maps.app.goo.gl/YxrJHinHSRriEGiL6)' },
        { k: ['paternity', 'dna', 'maternity', 'sibling', 'father', 'baba', 'grandparent', 'avuncular', 'nipp', 'prenatal'],
          a: 'DNA tests (results in 7-14 days, 99.99% accuracy, confidential):\n- Paternity or Maternity: **KSh 35,000**\n- Siblings / Grandparentage / Aunt-Uncle: **KSh 50,000**\n- Prenatal paternity (NIPP): **KSh 200,000**\n\nFree home sample collection within Nairobi.\n\n[View DNA tests](/dna-services)' },
        { k: ['bloodline', 'show', 'free dna', 'tv'],
          a: 'On **The Bloodline Show**, selected families get a **free DNA test** and their results are revealed on the show.\n\n[Apply for a free DNA test](/bloodline-apply)' },
        { k: ['lab', 'test', 'blood', 'malaria', 'hiv', 'sugar', 'urine', 'stool', 'culture', 'hormone', 'sti', 'psa', 'price list'],
          a: 'Some popular lab tests:\n- Malaria test **KSh 400**\n- HIV test **KSh 400**\n- Blood sugar **KSh 200**\n- Full blood count **KSh 1,000**\n- Kidney or liver function **KSh 2,000**\n\nMany results are ready the same day.\n\n[See all lab tests & prices](/lab-services)' },
        { k: ['ultrasound', 'scan', 'imaging', 'pregnan', 'obstetric', 'doppler', 'x-ray', 'xray'],
          a: 'Ultrasound scans start from **KSh 1,500** (obstetric, abdominal, pelvic). Specialised scans are KSh 2,000 and Doppler scans KSh 3,500. Mobile ultrasound is available within Nairobi.\n\n[View imaging prices](/imaging-services)' },
        { k: ['pharmacy', 'medicine', 'drug', 'deliver', 'dawa', 'prescription', 'order'],
          a: 'You can order medicines online for delivery. Add items to your cart, enter your address and we\'ll call to confirm the total, delivery fee and payment (M-Pesa or cash). Rx items need a prescription.\n\n[Visit the pharmacy](/pharmacy)' },
        { k: ['wellness', 'checkup', 'check-up', 'package', 'screening'],
          a: 'Wellness packages:\n- Women\'s from **KSh 10,000**\n- Men\'s from **KSh 12,000**\n- Family (4 people) from **KSh 15,000**\n\nEach includes a doctor consultation.\n\n[Book a package](/book-wellness)' },
        { k: ['dental', 'tooth', 'teeth', 'dentist', 'meno'],
          a: 'Our dental clinic offers routine checkups through to specialised treatment.\n\n[Book a dental visit](/book-appointment)' },
        { k: ['price', 'cost', 'how much', 'bei', 'charge', 'fee'],
          a: 'Prices are listed on each service page:\n- [Lab tests](/lab-services)\n- [DNA tests](/dna-services)\n- [Ultrasound](/imaging-services)\n- [Wellness packages](/book-wellness)\n\nFor consultation fees, call ' + PHONE + '.' },
        { k: ['person', 'human', 'agent', 'call', 'talk', 'phone', 'whatsapp', 'contact', 'speak'],
          a: 'Our team is happy to help. Call or WhatsApp **' + PHONE + '** (daily, 8 AM - 9 PM).\n\n[Chat on WhatsApp](https://wa.me/254740250696)' },
        { k: ['emergency', 'urgent', 'bleeding', 'chest pain', 'breath', 'unconscious', 'dharura'],
          a: 'If this is an emergency, please call emergency services or go to the nearest emergency department **now**. You can also call us on ' + PHONE + '.' },
        { k: ['hi', 'hello', 'hey', 'habari', 'jambo', 'good morning', 'good evening'],
          a: 'Hello! How can I help you today? You can ask about booking, prices, DNA tests, the pharmacy or our opening hours.' },
        { k: ['thank', 'asante'],
          a: 'You\'re welcome! Anything else I can help with?' }
    ];

    // Keywords match at the start of a word ("hi" won't match "which";
    // stems like "pregnan" still match "pregnancy")
    const keyRegex = k => new RegExp('(^|[^a-z])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    FAQ.forEach(entry => { entry.re = entry.k.map(keyRegex); });

    function faqAnswer(text) {
        const t = text.toLowerCase();
        let best = null;
        let bestScore = 0;
        FAQ.forEach((entry, i) => {
            let score = 0;
            entry.re.forEach((re, j) => { if (re.test(t)) score += entry.k[j].length > 4 ? 2 : 1; });
            // Earlier (more specific) entries win ties
            if (score > bestScore) { best = i; bestScore = score; }
        });
        if (best !== null && bestScore > 0) return FAQ[best].a;
        return 'I\'m not sure about that one. Our team can help directly - call or WhatsApp **' + PHONE + '** (daily, 8 AM - 9 PM).\n\n[Chat on WhatsApp](https://wa.me/254740250696)';
    }

    // ---------- safe rendering of bot replies ----------
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const SAFE_LINK = /^(\/(?!\/)[\w\-./?=&#%]*|tel:\+?[\d\s]+|mailto:[\w.@+-]+|https:\/\/(wa\.me|maps\.app\.goo\.gl|www\.youtube\.com|youtube\.com|www\.microafiahealthcare\.co\.ke)\/[^\s)]*)$/i;

    function inline(text) {
        let html = esc(text);
        html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
            const raw = url.replace(/&amp;/g, '&');
            if (!SAFE_LINK.test(raw)) return label;
            const external = /^https:/i.test(raw);
            return `<a href="${esc(raw)}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
        });
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        return html;
    }

    function format(text) {
        const blocks = String(text).trim().split(/\n{2,}/);
        return blocks.map(block => {
            const lines = block.split('\n');
            if (lines.every(l => /^\s*[-*•]\s+/.test(l))) {
                return '<ul>' + lines.map(l => '<li>' + inline(l.replace(/^\s*[-*•]\s+/, '')) + '</li>').join('') + '</ul>';
            }
            return '<p>' + lines.map(inline).join('<br>') + '</p>';
        }).join('');
    }

    // ---------- state ----------
    let history = [];
    try { history = (() => { const value = JSON.parse(sessionStorage.getItem(STORE_KEY)); return Array.isArray(value) ? value.filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string').slice(-40).map(message => ({ role: message.role, content: message.content.slice(0, 4000) })) : []; })(); } catch (e) { history = []; }
    const save = () => { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-40))); } catch (e) { /* ignore */ } };
    let busy = false;

    // ---------- build widget ----------
    const root = document.createElement('div');
    root.className = 'cb-root';
    root.innerHTML = `
        <div class="cb-teaser" hidden>
            <button type="button" class="cb-teaser-close" aria-label="Dismiss">&times;</button>
            <strong>Hi there!</strong> Ask me anything about our services, prices or booking.
        </div>
        <button type="button" class="cb-launcher" aria-label="Open chat assistant" aria-expanded="false" aria-controls="cbPanel">
            <i class="fas fa-comment-dots cb-ico-open" aria-hidden="true"></i>
            <i class="fas fa-times cb-ico-close" aria-hidden="true"></i>
            <span class="cb-online" aria-hidden="true"></span>
        </button>
        <section class="cb-panel" id="cbPanel" role="dialog" aria-modal="false" aria-label="Microafia chat assistant" hidden>
            <header class="cb-head">
                <span class="cb-avatar" aria-hidden="true"><i class="fas fa-user-nurse"></i></span>
                <div class="cb-title">
                    <strong>Microafia Assistant</strong>
                    <small><span class="cb-dot"></span> Online &middot; replies instantly</small>
                </div>
                <button type="button" class="cb-icon-btn" data-cb="reset" aria-label="Start a new chat" title="New chat"><i class="fas fa-rotate-right"></i></button>
                <button type="button" class="cb-icon-btn" data-cb="close" aria-label="Close chat" title="Close"><i class="fas fa-times"></i></button>
            </header>
            <div class="cb-body" aria-live="polite"></div>
            <form class="cb-form" novalidate>
                <textarea class="cb-input" rows="1" maxlength="1000" placeholder="Type your question..." aria-label="Your message"></textarea>
                <button type="submit" class="cb-send" aria-label="Send"><i class="fas fa-paper-plane"></i></button>
            </form>
            <p class="cb-foot">AI assistant &middot; not medical advice &middot; <a href="tel:+254740250696">${PHONE}</a></p>
        </section>`;
    document.body.appendChild(root);

    const launcher = root.querySelector('.cb-launcher');
    const panel = root.querySelector('.cb-panel');
    const body = root.querySelector('.cb-body');
    const form = root.querySelector('.cb-form');
    const input = root.querySelector('.cb-input');
    const sendBtn = root.querySelector('.cb-send');
    const teaser = root.querySelector('.cb-teaser');

    function scrollDown() { body.scrollTop = body.scrollHeight; }

    function addBubble(role, content, opts = {}) {
        const row = document.createElement('div');
        row.className = 'cb-msg cb-' + (role === 'user' ? 'user' : 'bot');
        const bubble = document.createElement('div');
        bubble.className = 'cb-bubble';
        if (role === 'user') bubble.textContent = content;
        else bubble.innerHTML = format(content);
        row.appendChild(bubble);
        body.appendChild(row);
        if (opts.chips) addChips();
        scrollDown();
    }

    function addChips() {
        const wrap = document.createElement('div');
        wrap.className = 'cb-chips';
        wrap.innerHTML = CHIPS.map(c => `<button type="button" class="cb-chip" data-q="${esc(c.q)}">${esc(c.label)}</button>`).join('');
        body.appendChild(wrap);
    }

    function showTyping() {
        const row = document.createElement('div');
        row.className = 'cb-msg cb-bot cb-typing';
        row.innerHTML = '<div class="cb-bubble"><span></span><span></span><span></span></div>';
        body.appendChild(row);
        scrollDown();
        return row;
    }

    function renderAll() {
        body.innerHTML = '';
        addBubble('assistant', WELCOME, { chips: history.length === 0 });
        history.forEach(m => addBubble(m.role, m.content));
    }

    // ---------- open / close ----------
    function open() {
        panel.hidden = false;
        root.classList.add('is-open');
        launcher.setAttribute('aria-expanded', 'true');
        launcher.setAttribute('aria-label', 'Close chat assistant');
        teaser.hidden = true;
        try { localStorage.setItem(TEASER_KEY, '1'); } catch (e) { /* ignore */ }
        if (!body.children.length) renderAll();
        scrollDown();
        setTimeout(() => input.focus(), 60);
    }

    function close() {
        panel.hidden = true;
        root.classList.remove('is-open');
        launcher.setAttribute('aria-expanded', 'false');
        launcher.setAttribute('aria-label', 'Open chat assistant');
        launcher.focus();
    }

    launcher.addEventListener('click', () => (panel.hidden ? open() : close()));

    // Turn the launcher gold when it sits over a green section, so it never blends in
    function parseRgb(str) {
        const m = str && str.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function isGreen(c) {
        const r = c.r / 255, g = c.g / 255, b = c.b / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
        if (d < 0.08 || l > 0.6) return false;            // greys and light tints keep the green launcher
        const s = d / (1 - Math.abs(2 * l - 1));
        let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
        return s > 0.2 && h >= 90 && h <= 200;           // green through teal
    }
    function colourBehind(x, y) {
        for (const el of document.elementsFromPoint(x, y)) {
            if (root.contains(el) || el.closest('.floating-whatsapp')) continue;
            const cs = getComputedStyle(el);
            if (/gradient/.test(cs.backgroundImage)) return parseRgb(cs.backgroundImage);
            if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'IFRAME' || cs.backgroundImage !== 'none') return null;
            const c = parseRgb(cs.backgroundColor);
            if (c && c.a > 0.5) return c;
        }
        return null;
    }
    let toneQueued = false;
    function updateTone() {
        toneQueued = false;
        const r = launcher.getBoundingClientRect();
        if (!r.width) return;
        const c = colourBehind(r.left + r.width / 2, r.top + r.height / 2);
        root.classList.toggle('on-green', !!c && isGreen(c));
    }
    function queueTone() {
        if (!toneQueued) { toneQueued = true; requestAnimationFrame(updateTone); }
    }
    window.addEventListener('scroll', queueTone, { passive: true });
    window.addEventListener('resize', queueTone);
    window.addEventListener('load', queueTone);
    queueTone();
    root.querySelector('[data-cb="close"]').addEventListener('click', close);
    root.querySelector('[data-cb="reset"]').addEventListener('click', () => {
        if (busy) return;
        history = [];
        save();
        renderAll();
        input.focus();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });

    // A one-time gentle nudge per visitor
    let teased = false;
    try { teased = localStorage.getItem(TEASER_KEY) === '1'; } catch (e) { /* ignore */ }
    if (!teased) {
        setTimeout(() => { if (panel.hidden) teaser.hidden = false; }, 8000);
    }
    teaser.querySelector('.cb-teaser-close').addEventListener('click', e => {
        e.stopPropagation();
        teaser.hidden = true;
        try { localStorage.setItem(TEASER_KEY, '1'); } catch (err) { /* ignore */ }
    });
    teaser.addEventListener('click', open);

    // ---------- sending ----------
    async function ask(text) {
        const question = text.trim().slice(0, 1000);
        if (!question || busy) return;
        busy = true;
        sendBtn.disabled = true;
        body.querySelectorAll('.cb-chips').forEach(c => c.remove());

        history.push({ role: 'user', content: question });
        save();
        addBubble('user', question);
        const typing = showTyping();

        let reply = null;
        let requestTimer;
        try {
            const ctrl = new AbortController();
            requestTimer = setTimeout(() => ctrl.abort(), 30000);
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: history.slice(-MAX_HISTORY) }),
                signal: ctrl.signal
            });
            const isJson = (res.headers.get('content-type') || '').includes('application/json');
            if (isJson) {
                const data = await res.json();
                if (data && typeof data.reply === 'string' && data.reply.trim()) reply = data.reply;
            }
        } catch (e) {
            reply = null;   // offline, endpoint missing, or timed out
        } finally {
            clearTimeout(requestTimer);
        }
        if (!reply) reply = faqAnswer(question);

        typing.remove();
        history.push({ role: 'assistant', content: reply });
        save();
        addBubble('assistant', reply);
        busy = false;
        sendBtn.disabled = false;
        input.focus();
    }

    form.addEventListener('submit', e => {
        e.preventDefault();
        const text = input.value;
        input.value = '';
        autosize();
        ask(text);
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
    });

    function autosize() {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    }
    input.addEventListener('input', autosize);

    body.addEventListener('click', e => {
        const chip = e.target.closest('.cb-chip');
        if (chip) ask(chip.dataset.q);
    });
})();
