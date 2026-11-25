// The Bloodline Show - application form.
// Saves each application to the Firestore `bloodline_applications`
// collection; staff review them in admin > Bloodline.
document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('bloodlineForm');
    if (!form) return;

    const errorEl = document.getElementById('blError');
    const submitBtn = document.getElementById('blSubmit');
    const story = document.getElementById('blStory');
    const storyCount = document.getElementById('blStoryCount');
    const success = document.getElementById('blSuccess');
    let sending = false;

    story.addEventListener('input', () => { storyCount.textContent = story.value.length; });

    function showError(msg, field) {
        errorEl.textContent = msg;
        errorEl.hidden = !msg;
        if (field) field.focus();
    }

    const clean = v => String(v || '').trim();

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (sending) return;
        showError('');

        const data = new FormData(form);

        // Spam trap filled in -> pretend success, save nothing
        if (clean(data.get('website'))) { finish('THANKS'); return; }

        const fullName = clean(data.get('fullName'));
        const phone = clean(data.get('phone'));
        const email = clean(data.get('email'));
        const location = clean(data.get('location'));
        const testType = data.get('testType');
        const people = clean(data.get('people'));
        const storyText = clean(data.get('story'));

        if (fullName.length < 3) return showError('Please enter your full name.', form.fullName);
        if (!/^[+\d][\d\s-]{8,15}$/.test(phone)) return showError('Please enter a valid phone number.', form.phone);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Please check your email address, or leave it blank.', form.email);
        if (!location) return showError('Please tell us your town or area.', form.location);
        if (!testType) return showError('Please choose what you would like to find out.', form.querySelector('[name="testType"]'));
        if (!people) return showError('Please tell us who would be tested.', form.people);
        if (storyText.length < 20) return showError('Please tell us a little more about your story.', story);
        if (!form.consentTest.checked) return showError('Everyone to be tested must agree to take part.', form.consentTest);
        if (!form.consentShow.checked) return showError('You need to agree to appear on the show if selected.', form.consentShow);

        if (typeof db === 'undefined') {
            return showError('We could not connect right now. Please try again, or call +254 740 250 696.');
        }

        sending = true;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        try {
            const ref = await db.collection('bloodline_applications').add({
                fullName,
                phone,
                email,
                location,
                testType,
                people,
                story: storyText,
                consentTest: true,
                consentShow: true,
                status: 'new',
                source: 'website',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            finish(ref.id.slice(0, 6).toUpperCase());
        } catch (err) {
            console.error('Application failed:', err.code || err.message);
            showError('Sorry, we couldn\'t send your application. Please try again, or call +254 740 250 696.');
            sending = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Submit application';
        }
    });

    function finish(reference) {
        document.getElementById('blRef').textContent = reference;
        form.hidden = true;
        document.querySelector('.booking-form-container .form-header').hidden = true;
        success.hidden = false;
        success.focus();
        success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});
