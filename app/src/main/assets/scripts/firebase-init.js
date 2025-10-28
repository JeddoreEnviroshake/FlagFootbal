window.__firebaseReady = false;
try {
  const firebaseConfig = {
    apiKey: "AIzaSyBOP7JnSA7lm0CVxUKlSi8nfXWwYokVZ9Q",
    authDomain: "flagfootball-4efca.firebaseapp.com",
    databaseURL: "https://flagfootball-4efca-default-rtdb.firebaseio.com",
    projectId: "flagfootball-4efca",
    storageBucket: "flagfootball-4efca.appspot.com",
    messagingSenderId: "207525608357",
    appId: "1:207525608357:web:54747b1ea6d1661bd4064c",
    measurementId: "G-J16S3S2N88"
  };

  if (window.firebase) {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }

    window.__firebaseReady = true;
  }
} catch (e) {
  console.warn("Firebase init failed:", e);
}
