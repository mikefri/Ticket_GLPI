const CACHE_NAME = 'Ticket_GLPI_V1.0.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/login.html',
  '/profil.html',
  '/stats.html',
  '/tickets.html',
  '/users.html',
  '/assets/css/styles.css',
  '/assets/img/GLPi.png',
  '/assets/img/logo-technicentre.svg',
  '/assets/js/admin.js',
  '/assets/js/app.js',
  '/assets/js/create-ticket.js',
  '/assets/js/firebase-init.js',
  '/assets/js/login.js',
  '/assets/js/profil.js',
  '/assets/js/stats.js',
  '/assets/js/tickets.js',
  '/assets/js/users.js',
  '/LICENSE'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker installation en cours...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache ouvert, ajout des assets statiques');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('Assets statiques en cache');
        self.skipWaiting();
      })
      .catch((error) => {
        console.error('Erreur lors de la mise en cache des assets:', error);
      })
  );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker activation en cours...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => {
              console.log('Suppression du cache ancien:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Stratégie de fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET
  if (request.method !== 'GET') {
    return;
  }

  // Ignorer les requêtes externes non essentielles
  if (url.origin !== location.origin) {
    return;
  }

  // Stratégie pour les assets statiques (CSS, JS, images)
  if (request.destination === 'style' || 
      request.destination === 'script' || 
      request.destination === 'image') {
    event.respondWith(
      caches.match(request)
        .then((response) => {
          if (response) {
            return response;
          }
          
          return fetch(request)
            .then((response) => {
              // Ne pas cacher les réponses non-succès
              if (!response || response.status !== 200 || response.type === 'error') {
                return response;
              }
              
              // Cacher la réponse
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(request, responseToCache);
                });
              
              return response;
            })
            .catch(() => {
              // Fallback pour les erreurs réseau
              if (request.destination === 'image') {
                return caches.match('/assets/img/logo-technicentre.svg');
              }
              return new Response('Ressource non disponible', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
        })
    );
    return;
  }

  // Stratégie pour les requêtes HTML et API (Network First)
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cacher les réponses valides
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // Fallback au cache en cas d'erreur réseau
        return caches.match(request)
          .then((response) => {
            if (response) {
              return response;
            }
            
            // Fallback pour les pages HTML
            if (request.headers.get('accept').includes('text/html')) {
              return caches.match('/index.html');
            }
            
            return new Response('Hors ligne - Ressource non disponible', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// Gestion des messages depuis le client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME);
  }
});

// Synchronisation en arrière-plan (optionnel)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-tickets') {
    event.waitUntil(
      fetch('/api/tickets')
        .catch(() => console.log('Synchronisation échouée'))
    );
  }
});
