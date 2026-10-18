// Konfigurasi BERESIN untuk situs aansereh25-code.github.io/beresin
// Konfigurasi web Firebase memang publik; keamanan data dijaga oleh aturan Firestore.
// Email admin disimpan sebagai hash SHA-256 agar tidak terlihat publik.
window.BERESIN_CONFIG = {
  firebase: {
      "apiKey": "AIzaSyBTPlt20YsD8eYRHq2DTQIZboum_JZEeIE",
      "authDomain": "beresin-76f2c.firebaseapp.com",
      "projectId": "beresin-76f2c",
      "storageBucket": "beresin-76f2c.firebasestorage.app",
      "messagingSenderId": "860459855388",
      "appId": "1:860459855388:web:9300db11f30e0c8f7039d9"
  },
  owners: [],
  ownerHashes: ["34b12f0c9e189201f17f154ad6d138d7a99e959507ba30532ab04c21c4a49d68"],
  storage: false // Firebase Storage perlu paket Blaze; false = foto disimpan di Firestore
};
