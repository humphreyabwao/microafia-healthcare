// Separate Firebase app keeps visitor upload sessions out of the staff login.
const patientUploads = (() => {
    let app;
    let session;
    function getApp() {
        if (!app) app = firebase.initializeApp(firebaseConfig, 'patient-uploads');
        return app;
    }
    return {
        get storage() { return getApp().storage(); },
        ensureUser() {
            if (!session) {
                session = (async () => {
                    const auth = getApp().auth();
                    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
                    const user = await new Promise((resolve, reject) => {
                        const unsubscribe = auth.onAuthStateChanged(current => {
                            unsubscribe();
                            resolve(current);
                        }, reject);
                    });
                    return user || (await auth.signInAnonymously()).user;
                })().catch(error => { session = null; throw error; });
            }
            return session;
        }
    };
})();
