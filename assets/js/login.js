// login.js
// assets/js/login.js
import { auth } from './firebase-init.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { toast } from './app.js';
/* ... le même code que ci‑dessus ... */
``

const form = document.getElementById('form-login');
const btnRegister = document.getElementById('btn-register');

onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = 'index.html';
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const pass = document.getElementById('password').value;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    // Redirection se fera dans onAuthStateChanged
  } catch (e) {
    (toast ? toast('Connexion échouée: ' + (e?.message || e)) : alert('Connexion échouée: ' + (e?.message || e)));
  }
});

btnRegister?.addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const pass = document.getElementById('password').value;
  if (!email || !pass) {
    return (toast ? toast('Saisissez email et mot de passe pour créer un compte') : alert('Saisissez email et mot de passe pour créer un compte'));
  }

  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    (toast ? toast('Compte créé, vous êtes connecté.') : null);
    // Redirection via onAuthStateChanged
  } catch (e) {
    (toast ? toast('Création échouée: ' + (e?.message || e)) : alert('Création échouée: ' + (e?.message || e)));
  }
});
