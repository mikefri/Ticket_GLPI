import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBDjuTUFVR5Ncxg5ptIZXB-CKU2HPUYQKU",
  authDomain: "serviceedglpi.firebaseapp.com",
  databaseURL: "https://serviceedglpi-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "serviceedglpi",
  storageBucket: "serviceedglpi.firebasestorage.app",
  messagingSenderId: "972055143589",
  appId: "1:972055143589:web:cac4bd60283f2160a1994c"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
