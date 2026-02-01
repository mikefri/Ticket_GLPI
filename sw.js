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

// Installation du Service Worker - SOUPLE (pas de blocage)
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installation en cours...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Cache ouvert');
        
        // Mettre en cache les fichiers un par un (sans bloquer)
        STATIC_ASSETS.forEach((asset) => {
          fetch(asset)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(asset, response);
                console.log(`✅ ${asset} en cache`);
              }
            })
            .catch(() => {
              console.warn(`⚠️ ${asset} non trouvé (ce n'est pas grave)`);
            });
        });
        
        self.skipWaiting();
      })
      .catch((error) => {
        console.error('❌ Erreur cache:', error);
        self.skipWaiting();
      })
  );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker activation en cours...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => {
              console.log(`🗑️ Suppression du cache ancien: ${cacheName}`);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('✅ Activation terminée');
        return self.clients.claim();
      })
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

  // Ignorer les requêtes externes (Firebase, etc)
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
          // Si en cache, retourner immédiatement
          if (response) {
            return response;
          }
          
          // Sinon, fetch et mettre en cache
          return fetch(request)
            .then((response) => {
              if (!response || response.status !== 200) {
                return response;
              }
              
              // Cloner et mettre en cache
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(request, responseToCache);
                });
              
              return response;
            })
            .catch(() => {
              // Fallback en cas d'erreur
              if (request.destination === 'image') {
                return caches.match('/assets/img/logo-technicentre.svg')
                  .catch(() => new Response('Image non disponible', { status: 404 }));
              }
              return new Response('Ressource non disponible', { status: 503 });
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
        // Mode hors ligne: essayer le cache
        return caches.match(request)
          .then((response) => {
            if (response) {
              return response;
            }
            
            // Fallback pour les pages HTML
            if (request.headers.get('accept')?.includes('text/html')) {
              return caches.match('/index.html')
                .catch(() => new Response('Page non disponible (hors ligne)', { status: 503 }));
            }
            
            return new Response('Hors ligne - Ressource non disponible', { status: 503 });
          });
      })
  );
});

// Gestion des messages depuis le client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('📤 Mise à jour du SW...');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('🗑️ Vidage du cache...');
    caches.delete(CACHE_NAME);
  }
});

// Synchronisation en arrière-plan (optionnel)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-tickets') {
    console.log('🔄 Synchronisation des tickets...');
    event.waitUntil(
      fetch('/api/tickets')
        .catch(() => console.log('⚠️ Synchronisation échouée'))
    );
  }
});

console.log('✨ Service Worker chargé - Version:', CACHE_NAME);
