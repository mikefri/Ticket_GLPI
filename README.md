# Service ED Reflex – Portail SNCF (Firebase + GitHub Pages)

Template **professionnel** aux **couleurs SNCF** (violet) et design **modernisé** :
- UI : **Bootstrap 5** + thème personnalisé (violet #CA005D, gris #F4F4F4)
- Backend : **Firebase Auth + Firestore**
- Pages : Login · Accueil (Service ED Reflex) · Mes tickets · Admin

## Mise en route
1. Ouvrez `assets/js/firebase-init.js` et remplacez la configuration par celle de votre projet Firebase (Web App).
2. Dans Firestore → **Rules** collez `firestore.rules` et **Publish**.
3. Dans Firestore → créez la collection **`admins`** et ajoutez un document dont l'**ID = votre UID** (dans Auth → Users).
4. Déployez sur **GitHub Pages** (Settings → Pages → Branch `main`).

---
© 2026 – Service ED Reflex (template)
