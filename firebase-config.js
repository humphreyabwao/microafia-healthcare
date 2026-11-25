// Firebase Configuration - Microafia Healthcare
const firebaseConfig = {
    apiKey: "AIzaSyBraIYOO-uI1HjKhumh_4tGI4Ln3FnquNg",
    authDomain: "microafia-c4232.firebaseapp.com",
    projectId: "microafia-c4232",
    storageBucket: "microafia-c4232.firebasestorage.app",
    messagingSenderId: "10541188258",
    appId: "1:10541188258:web:fff0b7ced502b8a254c3fb",
    measurementId: "G-2SXTF0S0FC"
};

// Initialize Firebase
const firebaseApp = typeof firebase !== 'undefined' ? firebase.initializeApp(firebaseConfig) : null;
const db = firebaseApp && typeof firebase.firestore === 'function' ? firebase.firestore() : undefined;
// Pages without uploads intentionally omit the Storage SDK.
const storage = firebaseApp && typeof firebase.storage === 'function' ? firebase.storage() : null;
