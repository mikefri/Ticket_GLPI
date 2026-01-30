import { auth } from './firebase-init.js';
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { toast } from './app.js';

const btnGoogle = document.getElementById('btn-google');
const form = document.getElementById('form-login');
const btnRegister = document.getElementById('btn-register');

onAuthStateChanged(auth, (user) => { if (user) window.location.href = 'index.html'; });

btnGoogle?.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    toast('Erreur Google: ' + (e?.message||e));
  }
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    toast('Connexion échouée: ' + (e?.message||e));
  }
});

btnRegister?.addEventListener('click', async () => {
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;
  if (!email || !pass) return toast('Saisissez email et mot de passe pour créer un compte');
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    toast('Compte créé, vous êtes connecté.');
  } catch (e) {
    toast('Création échouée: ' + (e?.message||e));
  }
});
