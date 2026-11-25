// Book Appointment: choose a service, date and time slot, then save to `appointments`.
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('appointmentForm');
    if (!form) return;
    const $ = id => document.getElementById(id);

    const dateInput = $('preferredDate');
    const timesEl = $('apTimes');
    const errorEl = $('apError');
    const submitBtn = $('apSubmit');
    const summary = $('apSummary');
    const done = $('apDone');
    const panel = $('apPanel');
    const bar = $('apBar');
    const shortcut = $('apShortcut');

    const OPEN = 8 * 60, LAST = 20 * 60, STEP = 30, LEAD = 30;   // minutes; last slot 8:00 PM
    const GROUPS = [['Morning', 0, 12 * 60], ['Afternoon', 12 * 60, 17 * 60], ['Evening', 17 * 60, 24 * 60]];
    let isSubmitting = false;
    let panelInView = false;

    // Pages that handle a service better on their own
    const SHORTCUTS = {
        ultrasound: ['/imaging-services', 'Choose your scans and upload a doctor\'s request on the imaging page'],
        'lab-services': ['/lab-services', 'See test prices or upload a lab request on the laboratory page'],
        'dna-paternity': ['/dna-services', 'Compare DNA tests and order a home sample pickup'],
        'women-wellness': ['/book-wellness?package=women', 'See what the Women\'s Wellness package includes'],
        'men-wellness': ['/book-wellness?package=men', 'See what the Men\'s Wellness package includes'],
        'family-wellness': ['/book-wellness?package=family', 'See what the Family Wellness package includes'],
        pharmacy: ['/pharmacy', 'Order medicines for delivery from our online pharmacy']
    };

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const nowMinutes = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
    const label = m => {
        const h = Math.floor(m / 60), mm = pad(m % 60);
        return `${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
    };
    const value = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

    const today = new Date();
    const first = new Date(today);
    if (nowMinutes() + LEAD > LAST) first.setDate(first.getDate() + 1);   // no slots left today
    const last = new Date(today);
    last.setMonth(last.getMonth() + 3);
    dateInput.min = isoDay(first);
    dateInput.max = isoDay(last);

    const prettyDate = iso => {
        const [y, m, d] = iso.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const rel = iso === isoDay(today) ? 'Today, ' : iso === isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)) ? 'Tomorrow, ' : '';
        return rel + date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    };

    // ---------- time slots ----------
    function renderTimes() {
        const chosen = form.elements.preferredTime?.value || '';
        const isToday = dateInput.value === isoDay(today);
        const earliest = isToday ? nowMinutes() + LEAD : 0;
        const slots = [];
        for (let m = OPEN; m <= LAST; m += STEP) slots.push(m);

        timesEl.replaceChildren(...GROUPS.map(([name, from, to]) => {
            const group = document.createElement('div');
            group.className = 'ap-times-group';
            const title = document.createElement('p');
            title.className = 'ap-group-title';
            title.textContent = name;
            const pills = document.createElement('div');
            pills.className = 'ap-pills';
            slots.filter(m => m >= from && m < to).forEach(m => {
                const pill = document.createElement('label');
                pill.className = 'ap-pill';
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = 'preferredTime';
                input.value = value(m);
                input.required = true;
                input.disabled = m < earliest;
                input.checked = !input.disabled && input.value === chosen;
                const text = document.createElement('span');
                text.textContent = label(m);
                pill.append(input, text);
                pills.append(pill);
            });
            group.append(title, pills);
            return group;
        }));
        updateSummary();
    }

    dateInput.addEventListener('change', renderTimes);

    // ---------- summary ----------
    const setSum = (id, text) => {
        const el = $(id);
        el.textContent = text || 'Not chosen yet';
        el.classList.toggle('is-empty', !text);
    };
    const serviceLabel = () => {
        const input = form.querySelector('input[name="service"]:checked');
        return input ? input.nextElementSibling.textContent.trim() : '';
    };
    const timeValue = () => form.querySelector('input[name="preferredTime"]:checked')?.value || '';
    const timeLabel = () => {
        const v = timeValue();
        if (!v) return '';
        const [h, m] = v.split(':').map(Number);
        return label(h * 60 + m);
    };

    function updateSummary() {
        const service = serviceLabel();
        setSum('apSumService', service);
        setSum('apSumDate', dateInput.value ? prettyDate(dateInput.value) : '');
        setSum('apSumTime', timeLabel());

        const key = form.querySelector('input[name="service"]:checked')?.value;
        const link = SHORTCUTS[key];
        shortcut.hidden = !link;
        if (link) {
            const a = document.createElement('a');
            a.href = link[0];
            a.textContent = link[1];
            shortcut.replaceChildren('You can book here, or: ', a);
        }

        $('apBarService').textContent = service || 'Choose a service';
        $('apBarWhen').textContent = dateInput.value
            ? `${prettyDate(dateInput.value)}${timeLabel() ? ' · ' + timeLabel() : ''}`
            : 'Pick a date and time';
        bar.hidden = !service || !done.hidden || panelInView;
    }

    form.addEventListener('change', e => {
        if (e.target.name === 'service' || e.target.name === 'preferredTime') {
            e.target.closest('.ap-step')?.classList.remove('is-invalid');
        }
        updateSummary();
    });
    form.addEventListener('input', e => {
        if (e.target.hasAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid');
    });

    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => { panelInView = entry.isIntersecting; updateSummary(); }, { threshold: 0.1 }).observe(panel);
    }

    // ---------- submit ----------
    function fail(message, target) {
        errorEl.textContent = message;
        errorEl.hidden = false;
        if (!target) return;
        if (target.matches('input, select, textarea')) {
            target.setAttribute('aria-invalid', 'true');
            target.focus();
        } else {
            target.classList.add('is-invalid');
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.querySelector('input:not(:disabled)')?.focus({ preventScroll: true });
        }
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (isSubmitting) return;
        errorEl.hidden = true;
        const f = form.elements;
        const serviceInput = form.querySelector('input[name="service"]:checked');
        const step = n => $(`apStep${n}`).closest('.ap-step');

        if (!serviceInput) return fail('Choose the service you need.', step(1));
        if (!dateInput.value || dateInput.value < dateInput.min || dateInput.value > dateInput.max) {
            return fail('Choose a date within the next three months.', dateInput);
        }
        if (!timeValue()) return fail('Choose a time.', step(2));
        if (!f.firstName.value.trim()) return fail('Please enter your first name.', f.firstName);
        if (!f.lastName.value.trim()) return fail('Please enter your last name.', f.lastName);
        if (f.phone.value.replace(/\D/g, '').length < 9) return fail('Please enter a phone number we can call.', f.phone);
        if (f.email.value.trim() && !f.email.checkValidity()) return fail('Please check your email address.', f.email);
        if (!f.agreeTerms.checked) return fail('Please tick the box to confirm you understand how booking works.', f.agreeTerms);

        const data = {
            firstName: f.firstName.value.trim(),
            lastName: f.lastName.value.trim(),
            phone: f.phone.value.trim(),
            email: f.email.value.trim() || 'Not provided',
            dob: f.dob.value || 'Not provided',
            gender: f.gender.value || 'Not specified',
            service: serviceInput.value,
            serviceName: serviceLabel(),
            preferredDate: dateInput.value,
            preferredTime: timeValue(),
            symptoms: f.symptoms.value.trim() || 'None',
            isNewPatient: f.isNewPatient.checked
        };

        isSubmitting = true;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Sending…';
        try {
            await db.collection('appointments').add({
                ...data,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'pending'
            });
        } catch (error) {
            console.error('Appointment request failed:', error);
            fail("We couldn't send your request. Please try again, or call +254 740 250 696.");
            return;
        } finally {
            isSubmitting = false;
            submitBtn.disabled = false;
            submitBtn.textContent = 'Request appointment';
        }

        $('apDoneText').textContent = `We'll call ${data.phone} shortly to confirm your ${data.serviceName.toLowerCase()} on ${prettyDate(data.preferredDate)} at ${timeLabel()}.`;
        form.reset();
        renderTimes();
        summary.hidden = true;
        done.hidden = false;
        updateSummary();
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        done.querySelector('h2').focus({ preventScroll: true });
    });

    $('apAgain').addEventListener('click', () => {
        done.hidden = true;
        summary.hidden = false;
        updateSummary();
        $('apStep1').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // ---------- deep link: /book-appointment?service=dental ----------
    const pre = new URLSearchParams(location.search).get('service');
    if (pre) {
        const input = [...form.querySelectorAll('input[name="service"]')].find(i => i.value === pre);
        if (input) input.checked = true;
    }

    renderTimes();
});
