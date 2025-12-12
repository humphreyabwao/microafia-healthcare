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
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

console.log('Firebase connected!');
