import { db, auth } from './firebase-init.js';
import { requireAuth, toast } from './app.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const form = document.getElementById('form-create');
const hintLogin = document.getElementById('hint-login');
const typeGroup = document.getElementById('ticket-type');
const typeHidden = document.getElementById('type-hidden');

typeGroup?.addEventListener('change', (e) => {
  const v = typeGroup.querySelector('input[name="ttype"]:checked')?.value || 'Demande';
  if (typeHidden) typeHidden.value = v;
});

(async () => {
  const user = await requireAuth(true);
  if (!user) {
    if (hintLogin) hintLogin.classList.remove('d-none');
    if (form) form.querySelector('button[type="submit"]').disabled = true;
    return;
  }
})();

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;

  const payload = {
    title: document.getElementById('title').value.trim(),
    description: document.getElementById('description').value.trim(),
    category: document.getElementById('category').value,
    priority: document.getElementById('priority').value,
    status: 'Ouvert',
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    email: user.email || '',
    type: typeHidden?.value || 'Demande'
  };

  try {
    await addDoc(collection(db, 'tickets'), payload);
    form.reset();
    toast('Ticket créé avec succès');
  } catch (err) {
    toast('Erreur: ' + (err?.message || err));
  }
});
