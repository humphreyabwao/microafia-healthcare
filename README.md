# Microafia Health

A modern healthcare management platform for booking appointments, lab services, wellness programs, and imaging services.

## Features

- **Appointment Booking** - Schedule medical consultations
- **Lab Services** - Order laboratory tests and view results
- **Wellness Programs** - Book health and wellness services
- **Imaging Services** - Request medical imaging appointments
- **Admin Dashboard** - Manage all bookings, messages, and settings

## Tech Stack

- HTML5, CSS3, JavaScript
- Firebase (Authentication & Firestore)
- Font Awesome Icons

## Getting Started

1. Clone the repository
```bash
git clone https://github.com/Noxar254/Microafia-Health.git
```

2. Configure Firebase
   - Update `firebase-config.js` with your Firebase credentials

3. Start the local server (Python 3 required):
```bash
python dev_server.py
```
   Open http://localhost:8000. This server supports clean URLs such as
   `/lab-services` and `/admin/login`, matching the site's hosting configuration.
   Use `python dev_server.py --port 8080` to choose a different port.

## Deploying Storage rules

The complete rules are in `storage.rules`. They match the upload code in this
repository. Publish this version of the site together with the rules.

1. In Firebase project `microafia-c4232`, enable **Authentication → Sign-in method →
   Anonymous**. Add `localhost` for local testing and your production site hostname
   under **Authentication → Settings → Authorized domains**.
2. Confirm **Storage** has been provisioned and `firebase-config.js` uses the actual
   bucket name. Enable the billing plan required by Firebase Storage if the console
   requests it. Rules cannot provision a bucket or fix disabled billing.
3. In **Storage → Rules**, replace the complete rules with `storage.rules` and
   publish. Alternatively, with Firebase CLI installed and signed in, run:

   ```bash
   firebase deploy --only storage --project microafia-c4232
   ```

4. Grant the appropriate Storage custom claims to existing staff Authentication
   UIDs. The `admin_users` role alone does not grant Storage access. In a trusted
   administrator environment with Application Default Credentials configured:

   ```bash
   python -m pip install firebase-admin
   python scripts/grant_storage_access.py STAFF_AUTH_UID --lab --pharmacy --products
   ```

   Omit flags the staff member does not need. Have them sign out and sign back in
   afterward. The script preserves other custom claims. Never put administrator
   credentials or service-account keys in the website.

Visitors receive a separate anonymous upload session; it does not sign them into
the staff dashboard. New files use `prescriptions/lab/{uid}/{uuid}.pdf` or
`prescriptions/pharmacy/{uid}/{uuid}.pdf` (JPG/PNG also supported). Each owner can
create, fetch and delete their own files; assigned staff can fetch/delete files
for their module. Files cannot be overwritten or listed. Documents are limited
to 5 MB; public pharmacy product photos are limited to 3 MB and can be uploaded
only by staff with the products permission. Existing prescription paths remain
readable by assigned staff but accept no new uploads. All other Storage paths
are denied.

Storage rules are separate from Firestore rules. Keep `lab_orders` and
`pharmacy_orders` readable only by authorized staff; customer-facing pages need
validated create access and the pharmacy catalogue needs public reads for active
products. Saved download URLs are bearer links, so access to order documents must
be protected. These Storage rules do not change Firestore permissions.

For a deployment smoke test, upload a non-patient test PDF in both forms, submit
test requests, check the saved attachment links from the staff dashboard, then
remove the test records and files. Confirm the browser shows a useful error if
uploading or saving an order is denied.

Firebase documentation: [anonymous sign-in](https://firebase.google.com/docs/auth/web/anonymous-auth),
[Storage rules conditions](https://firebase.google.com/docs/storage/security/rules-conditions).

To verify the rules locally without touching production, start the Auth and
Storage emulators with `firebase emulators:start --only auth,storage --project
demo-microafia`, then run `python tests/storage_rules_test.py`. Browser flow
tests are in `tests/lab-services.test.cjs` and `tests/pharmacy.test.cjs`; they
require Playwright Core and a Chromium installation. `tests/upload_emulator.test.cjs`
also tests the real Firebase upload SDK against local emulators, using cached
Firebase 13.4.0 compat SDKs from `FIREBASE_TEST_SDK` (or the system temp folder's
`microafia-firebase-sdk-13.4.0` directory). Most UI tests stub Firestore; the separate Firebase compat test uses the real
Firestore SDK and demo emulator.

## Verified optimization and security audit - 2026-11-25

The public site keeps the existing navigation, booking, lab/DNA ordering,
prescription uploads, pharmacy cart/delivery, Bloodline application and chat flows.
The founder section now uses the existing lab photograph with a readable overlay.

- Image originals are preserved. Content-addressed WebP copies, responsive image
  sources and real image dimensions reduce transfers and reserve layout space.
  The unique original image set is 3,385,619 bytes; its largest optimized copies
  total 643,294 bytes, about 81% smaller. Smaller mobile variants are also used.
- Ordered deferred scripts retain their dependencies. The unused Analytics SDK
  is removed, Firebase services initialize only when their SDK is available, and
  the first hero photograph/text can render without waiting for Firebase.
- Canonical URLs, one main heading per public page, existing structured data,
  current sitemap dates and noindex directives on staff pages are checked.
  Structured opening hours/social links match the visible site information.
- Customer-entered dashboard text is escaped at rendering boundaries. Executable
  prescription URLs are rejected, inline action arguments are safely encoded,
  and normal names, notes and reply actions are regression-tested.
- Accounts cannot bootstrap their own administrator role. Existing active staff
  keep access; missing staff records need a trusted admin claim, and failed
  permission lookups do not reveal the dashboard. Staff profiles are no longer
  created by an unprivileged browser fallback.
- Hosting configurations add anti-framing, MIME-sniffing protection, referrer
  policy, object/base restrictions, appropriate caching and a true 404 page.
  Development files are excluded or blocked. Netlify's duplicate header keys are
  fixed. The local server has matching protections and no directory listing.
- Chat requests have bounded history/body size, explicit origin/type checks,
  bounded per-instance rate-limit memory and non-sensitive error logging.
  The existing model and customer-care behavior are unchanged.
- The browser compat SDK is updated from Firebase 9.23.0 to 13.4.0 after actual
  Auth, Firestore and Storage emulator tests. This resolves the direct Firebase
  auth-token-sync advisory in versions below 10.9.0. A separate npm dependency
  audit still flags four high-severity npm entries from the Node gRPC dependency
  chain in the Firebase npm package;
  this static website serves the browser CDN builds, not that Node dependency
  tree. Do not reuse that npm tree for a server without resolving its advisories.
  The Cloud Function code in this repository uses the separately audited Firebase
  Admin dependency tree.

Verification covers all 21 HTML pages and eight public pages at 320, 375, 430,
767, 1024 and 1440 px; existing mobile navigation, lab upload and pharmacy tests;
actual booking-form payloads; stored-XSS cases; authorization cases; and real
Firebase upload SDK calls against local emulators. The Cloud Function dependency
audit reported zero known vulnerabilities at the time of this audit.

**Deployment boundary:** local tests do not certify the live Firebase project's
configuration. Review existing `admin_users` records against trusted staff before
deploying `firestore.rules`. These rules preserve validated public form creation,
keep patient records private, enforce module permissions and prevent self-promotion.
Keep `storage.rules` and the site's owner-scoped upload code in the same release.
Enable Anonymous Authentication and assign the Storage custom claims described
above. Deploy with the authorized project account after taking the normal backup:

```bash
firebase deploy --only hosting,firestore:rules,storage,functions --project microafia-c4232
```

Then smoke-test real staff sign-in, all booking/order types, attachments and chat
on the deployed hostname. No live patient records or production settings were
changed during this audit. Real-user Core Web Vitals, production cache behavior,
search indexing, account inventories and live security rules require post-deploy
checks. Public form abuse protection should include Firebase App Check after
monitoring; the chat limiter is per-instance and should be backed by a shared
limiter/App Check for stronger abuse protection. Do not enable enforcement before
the legitimate clients are configured. Stored attachment download URLs are bearer
links and must remain in staff-protected order documents.

Repeatable checks (Python with Pillow, Node and Playwright Core/Chromium required):

```bash
python tests/site_static_test.py
node --test tests/admin-authorization.test.cjs tests/request-policy.test.mjs
node tests/site-browser.test.cjs
node tests/admin-rendering.test.cjs
node tests/chatbot.test.cjs
node tests/public-forms.test.cjs
node tests/lab-services.test.cjs
node tests/pharmacy.test.cjs
node tests/mobile-navigation.test.cjs
```

With the demo Auth, Firestore and Storage emulators running, also run
`python tests/firestore_rules_test.py`, `python tests/storage_rules_test.py` and
`node tests/upload_emulator.test.cjs` and `node tests/firebase-compat.test.cjs`.
The Firestore test consumes the actual
payload fixtures generated by the public-form test; emulator tests use only
`demo-microafia`, never production. `STORAGE_EMULATOR_HOST`,
`STORAGE_EMULATOR_PORT` and `AUTH_EMULATOR_PORT` can select alternate local ports.
The upload SDK test uses the cached compat SDKs documented above.

References: [Firebase rules and claims](https://firebase.google.com/docs/auth/admin/custom-claims),
[Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing),
[responsive images](https://web.dev/learn/design/responsive-images),
[Firebase SDK advisory](https://github.com/advisories/GHSA-3wf4-68gx-mph8),
[Firestore browser transport source](https://github.com/firebase/firebase-js-sdk/blob/main/packages/firestore/src/platform/browser/webchannel_connection.ts).

## Project Structure

```
├── index.html          # Main landing page
├── book-appointment.*  # Appointment booking
├── lab-services.*      # Lab services
├── book-wellness.*     # Wellness programs
├── imaging-services.*  # Imaging services
├── admin/              # Admin dashboard
│   ├── index.html      # Dashboard home
│   ├── appointments.*  # Manage appointments
│   ├── lab-orders.*    # Manage lab orders
│   ├── wellness.*      # Manage wellness bookings
│   ├── messages.*      # View messages
│   ├── callbacks.*     # Callback requests
│   ├── users.*         # User management
│   ├── settings.*      # System settings
│   └── profile.*       # User profile
└── images/             # Image assets
```

## License

MIT License
