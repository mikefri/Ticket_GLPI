// profil.js – Gestion page profil

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast } from './app.js';

import {
  getAuth, updateProfile, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Auth
const auth = getAuth();

// DOM
const profilName     = document.getElementById('profil-name');
const profilEmail    = document.getElementById('profil-email');
const profilUid      = document.getElementById('profil-uid');
const profilCreated  = document.getElementById('profil-created');
const profilCanCreate = document.getElementById('profil-cancreate');
const btnSaveName    = document.getElementById('btn-save-name');
const newPassword    = document.getElementById('new-password');
const confirmPassword = document.getElementById('confirm-password');
const btnChangePw    = document.getElementById('btn-change-password');
const recentTickets  = document.getElementById('recent-tickets');

// Chargement infos utilisateur
async function loadProfile() {
  const user = await requireAuth(true);
  if (!user) return;

  profilEmail.value = user.email || '—';
  profilUid.textContent = user.uid;
  profilName.value = user.displayName || '';

  // Infos depuis Firestore /users/{uid}
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      profilName.value = data.displayName || profilName.value;
      profilCreated.textContent = data.createdAt 
        ? new Date(data.createdAt.toDate()).toLocaleDateString('fr-FR') 
        : '—';
      profilCanCreate.innerHTML = data.canCreateTickets !== false 
        ? '<span class="badge bg-success">Oui</span>' 
        : '<span class="badge bg-secondary">Non</span>';
    }
  } catch (err) {
    console.error('Erreur chargement profil', err);
  }
}

// Sauvegarde nom
btnSaveName?.addEventListener('click', async () => {
  const newName = profilName.value.trim();
  if (!newName) return toast('Nom requis');

  try {
    const user = auth.currentUser;
    await updateProfile(user, { displayName: newName });

    // Mise à jour Firestore
    await updateDoc(doc(db, 'users', user.uid), {
      displayName: newName
    });

    toast('Nom mis à jour');
  } catch (err) {
    toast('Échec mise à jour : ' + err.message);
  }
});

// Changer mot de passe
btnChangePw?.addEventListener('click', async () => {
  const pw = newPassword.value;
  const confirm = confirmPassword.value;

  if (!pw || pw.length < 8) return toast('Mot de passe ≥ 8 caractères');
  if (pw !== confirm) return toast('Les mots de passe ne correspondent pas');

  try {
    const user = auth.currentUser;

    // Pour changer le mot de passe, Firebase demande une ré-authentification récente
    // On demande le mot de passe actuel
    const currentPw = prompt('Pour sécurité, saisissez votre mot de passe actuel :');
    if (!currentPw) return;

    const credential = EmailAuthProvider.credential(user.email, currentPw);
    await reauthenticateWithCredential(user, credential);

    // OK, on change
    await updatePassword(user, pw);

    newPassword.value = '';
    confirmPassword.value = '';
    toast('Mot de passe changé avec succès !');
  } catch (err) {
    let msg = 'Échec changement';
    if (err.code === 'auth/wrong-password') msg = 'Mot de passe actuel incorrect';
    if (err.code === 'auth/requires-recent-login') msg = 'Veuillez vous reconnecter pour changer le mot de passe';
    toast(msg);
  }
});

// Tickets récents (optionnel)
async function loadRecentTickets() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const q = query(
      collection(db, 'tickets'),
      where('createdBy', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      recentTickets.innerHTML = '<p class="text-muted">Aucun ticket récent.</p>';
      return;
    }

    let html = '<ul class="list-group list-group-flush">';
    snap.forEach(doc => {
      const t = doc.data();
      html += `
        <li class="list-group-item">
          <div class="d-flex justify-content-between">
            <div><strong>${t.title}</strong></div>
            <small>${new Date(t.createdAt.toDate()).toLocaleDateString('fr-FR')}</small>
          </div>
          <div><span class="badge ${t.status === 'Résolu' ? 'bg-success' : 'bg-warning'}">${t.status}</span></div>
        </li>`;
    });
    html += '</ul>';
    recentTickets.innerHTML = html;
  } catch (err) {
    recentTickets.innerHTML = '<p class="text-danger">Erreur chargement tickets</p>';
  }
}

// Init
(async () => {
  await loadProfile();
  await loadRecentTickets();
})();
