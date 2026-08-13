# PLAN — FihSpot

## Objectif
Site web responsive mobile où les utilisateurs authentifiés ajoutent et consultent des **points d'intérêt** sur une carte. Un POI "focusé" affiche une fiche avec **commentaires**, **photos** et un bouton **"Ouvrir dans Google Maps"**. Site **en anglais par défaut** avec **traduction automatique en français** pour les visiteurs francophones (détection `navigator.language` + sélecteur FR/EN persistant).

> Statut : **implémenté et testé de bout en bout** (voir [Statut & état](#statut--état)).

## Stack
- **Frontend** : React 18 + TypeScript + Vite 6, React Router v7, **Google Maps JavaScript API** (`@googlemaps/js-api-loader`, **Advanced Markers** + Map ID), Tailwind CSS 3, Framer Motion, **i18next + react-i18next** (i18n anglais/français)
- **Backend** : Express 4 + TypeScript (tsx en dev, tsc → dist), Prisma ORM, JWT (jsonwebtoken)
- **Auth** : email/mot-de-passe (bcryptjs) + Google OAuth (flux serveur, validation du token via `tokeninfo`)
- **Photos** : upload local via `multer` 2.x, servi statiquement par Express (`/uploads`) ; les fichiers sont **partagés entre dev et Docker** via un bind mount (`./server/uploads`), et **supprimés du disque** quand une photo ou un POI est supprimé.
- **Base de données** : PostgreSQL 16 (Docker Compose)
- **Monorepo** : npm workspaces (`client/` + `server/`), scripts racine

## Architecture

### Structure réelle du monorepo
```
FihSpot/
├── PLAN.md                       # ce document
├── package.json                  # scripts racine (dev, build, db:migrate, db:seed)
├── package-lock.json
├── .env.example                  # modèle de config (PORT, JWT, DATABASE_URL, GOOGLE_*, VITE_GOOGLE_MAPS_*)
├── .gitignore
├── docker-compose.yml            # stack complète : db + server + client (nginx)
├── client/
│   ├── Dockerfile                # multi-stage : build Vite → nginx
│   ├── nginx.conf                # SPA fallback + proxy /api et /uploads → server:3000 + headers SW
│   ├── index.html                # fonts Inter, apple-touch-icon (plus de CSS Leaflet)
│   ├── vite.config.ts            # proxy dev /api + /uploads → localhost:3000 ; plugin PWA (Workbox, sans cache tuiles)
│   ├── tailwind.config.js        # tokens (palette brand, radii, ombres, dark mode class)
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── scripts/generate-icons.mjs  # génère les icônes PNG PWA depuis favicon.svg (sharp)
│   ├── public/
│   │   ├── favicon.svg
│   │   ├── pwa-192x192.png / pwa-512x512.png / apple-touch-icon.png
│   └── src/
│       ├── main.tsx              # bootstrap React + registerSW (PWA) + import i18n
│       ├── App.tsx               # AuthProvider + ToastProvider + router + transitions de page + OfflineBanner
│       ├── index.css             # Tailwind + styles Google Maps (marqueurs, dark map, marker fade)
│       ├── vite-env.d.ts         # types vite + vite-plugin-pwa/client + @types/google.maps + ImportMetaEnv
│       ├── lib/
│       │   └── googleMaps.ts     # loader Google Maps (@googlemaps/js-api-loader, library "marker") + export MAP_ID + type LatLng
│       ├── i18n/
│       │   ├── index.ts          # init i18next : résolution langue (localStorage > navigator.language fr* → fr sinon en), <html lang> + <title> dynamiques, changeLanguage persistant (fihspot_lang)
│       │   └── locales/
│       │       ├── en.ts         # dictionnaire anglais (défaut)
│       │       └── fr.ts         # dictionnaire français
│       ├── api/
│       │   ├── client.ts         # wrapper fetch + token JWT + cache user + erreurs offline-safe ; codes d'erreur → traduction i18n (errors.<CODE>)
│       │   └── types.ts          # User, PoI, PoISummary, Comment, Photo, Bounds
│       ├── context/
│       │   ├── AuthContext.tsx   # session depuis cache (hors-ligne), revalidation en arrière-plan
│       │   ├── ToastContext.tsx  # toasts animés (AnimatePresence)
│       │   └── ThemeContext.tsx  # thème light/dark persisté (localStorage) + class "dark" ; pilote aussi le colorScheme de la carte
│       ├── hooks/useMediaQuery.ts
│       ├── components/
│       │   ├── Navbar.tsx        # overlay glassmorphism sur la carte (chip utilisateur → profil)
│       │   ├── ThemeToggle.tsx   # bouton ☀️/🌙 (basculer le thème, y compris celui de la carte)
│       │   ├── LanguageToggle.tsx # bouton EN/FR (basculer la langue, persisté)
│       │   ├── SearchBar.tsx     # recherche ville/lieu (Nominatim, debounce, dropdown)
│       │   ├── UserLocationButton.tsx # localisation (navigator.geolocation) + centrage (au-dessus du FAB "+")
│       │   ├── OfflineBanner.tsx # bandeau "Hors ligne — données en cache"
│       │   ├── GoogleMapView.tsx # carte Google Maps (Advanced Markers, bounds, géoloc, mode ajout, colorScheme light/dark)
│       │   ├── PoiDrawer.tsx     # fiche POI (drawer mobile / side-panel desktop) + fade au refresh
│       │   ├── AddPoiPanel.tsx   # formulaire création après placement sur la carte
│       │   ├── GoogleButton.tsx  # Google Identity Services (bouton "Continuer avec Google")
│       │   ├── ProtectedRoute.tsx
│       │   ├── Button.tsx / Input.tsx / Logo.tsx / Spinner.tsx
│       └── pages/
│           ├── MapPage.tsx       # page principale : carte + drawer + FAB + états (+ focus ?poi=)
│           ├── ProfilePage.tsx   # profil : avatar upload, stats, onglets points/commentaires/photos
│           ├── LoginPage.tsx
│           └── RegisterPage.tsx
└── server/
    ├── Dockerfile                # multi-stage : npm ci → build tsc → node dist
    ├── package.json
    ├── tsconfig.json
    ├── .env                      # config locale de dev (gitignoré)
    ├── prisma/
    │   ├── schema.prisma
    │   ├── migrations/           # 20260812054708_init + 20260812232744_add_poi_demo_flag
    │   └── seed.ts               # user démo + 5 POI à Marseille (demo=true, contenus en anglais)
    ├── uploads/                  # photos (volume Docker, gitignoré)
    └── src/
        ├── index.ts              # bootstrap listen
        ├── app.ts                # createApp() : CORS, JSON, routes, statique, error handler
        ├── config.ts             # lecture .env ; demoEnabled = NODE_ENV !== 'production'
        ├── prisma.ts             # singleton PrismaClient
        ├── types.ts              # augmentation Express.Request.user
        ├── middleware/
        │   ├── auth.ts           # requireAuth (Bearer JWT → req.user)
        │   ├── upload.ts         # multer (jpeg/png/webp/gif, 5 Mo, nom aléatoire)
        │   └── errorHandler.ts   # ApiError (status, message, code) + MulterError + fallback 500
        ├── routes/
        │   ├── auth.ts           # register/login/google/me/config
        │   ├── pois.ts           # CRUD POI + commentaires + photos ; exclusion des POI demo en prod
        │   └── users.ts          # /api/me (contenu user) + /api/me/avatar (upload photo de profil)
        └── utils/
            ├── jwt.ts            # signToken / verifyToken
            ├── password.ts       # bcrypt hash / compare
            ├── serialize.ts      # publicUser (profil sérialisé)
            └── files.ts          # unlinkUpload (suppression fichier upload)
```

### Modèle de données (Prisma — implémenté)
- **User** : `id` (cuid), `email` (unique), `passwordHash?`, `googleId?` (unique), `name`, `avatarUrl?`, `createdAt`
- **PoI** : `id`, `name`, `description?`, `lat`, `lng`, `category?`, `demo` (booléen, défaut `false` — POI de démonstration), `createdById → User`, `createdAt`, `updatedAt` ; index `[lat, lng]`
- **Comment** : `id`, `content`, `userId → User`, `poiId → PoI` (onDelete: Cascade), `createdAt`
- **Photo** : `id`, `url`, `userId → User`, `poiId → PoI` (onDelete: Cascade), `createdAt`

Relations : User `1-n` PoI/Comment/Photo ; PoI `1-n` Comment/Photo.

## Docker Compose (implémenté)

```yaml
services:
  db:      # postgres:16-alpine, port 5432, volume pgdata, healthcheck pg_isready
  server:  # Dockerfile server, env (DATABASE_URL→db:5432, JWT_SECRET, GOOGLE_*), bind mount ./server/uploads → /app/server/uploads, port 3000
  client:  # Dockerfile client (nginx), port 8080:80, proxy /api + /uploads → server ; build ARGs VITE_GOOGLE_MAPS_API_KEY / VITE_GOOGLE_MAPS_MAP_ID injectés au build Vite
volumes:
  pgdata:
```

| Command | Description |
|---|---|
| `docker compose up -d db` | PostgreSQL seul (recommandé pour le dev) |
| `npm run dev` | Dev local : server (tsx watch :3000) + client (Vite :5173, proxy) |
| `npm run db:migrate` / `db:seed` | Migration Prisma + seed de démo |
| `docker compose up --build` | Stack complète production-like : `http://localhost:8080` |

- **POI de démo visibles uniquement en dev** : le seed crée des POI avec `demo = true` ; l'API les exclut quand `NODE_ENV=production` (défini dans le Dockerfile serveur). En dev local (`npm run dev`), `NODE_ENV` n'est pas défini → les POI de démo s'affichent.

- Au démarrage en Docker, le server exécute `prisma migrate deploy` avant `node dist/index.js`.
- Le client est servi par nginx : `try_files` SPA + reverse proxy `/api/` et `/uploads/` vers `server:3000`.
- Config serveur injectée via variables d'environnement : `DATABASE_URL=postgresql://fihspot:fihspot@db:5432/fihspot`, `JWT_SECRET` (défaut Docker sinon), `GOOGLE_CLIENT_ID/SECRET`, `CLIENT_URL`.
- Config Google Maps (client) injectée au build via ARG : `VITE_GOOGLE_MAPS_API_KEY` + `VITE_GOOGLE_MAPS_MAP_ID` (lues depuis `.env` racine, fournies par `docker-compose.yml`). En dev local, Vite lit `client/.env` (voir `client/.env.example`).

## API (implémentée)
> **Erreurs** : toutes les réponses d'erreur sont `{ error, code }` — message **en anglais par défaut** + **code machine stable** (ex. `EMAIL_TAKEN`, `POI_NOT_FOUND`, `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `IMAGE_TYPE_UNSUPPORTED`). Le client traduit `code` → message localisé (`errors.<CODE>` dans les dictionnaires EN/FR) ; fallback sur `error` si code inconnu. `ApiError` (serveur) et `ApiError` (client) portent tous deux un `code`.

### Auth — `server/src/routes/auth.ts`
| Méthode | Route | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | email + mot de passe + nom → `{ token, user }` | – |
| POST | `/api/auth/login` | email + mot de passe → `{ token, user }` | – |
| POST | `/api/auth/google` | `{ idToken }` Google → vérif `tokeninfo` → `{ token, user }` | – |
| GET | `/api/auth/me` | profil courant | ✅ |
| GET | `/api/auth/config` | `{ googleClientId }` pour le bouton Google | – |

### Points d'intérêt — `server/src/routes/pois.ts`
| Méthode | Route | Description | Auth |
|---|---|---|---|
| GET | `/api/pois` | liste + `_count` comments/photos ; filtres bounds `?swLat&swLng&neLat&neLng` ; **exclut les POI `demo` en production** | – |
| GET | `/api/pois/:id` | détail complet (createdBy, comments, photos) ; **404 si `demo` et `NODE_ENV=production`** | – |
| POST | `/api/pois` | créer (name, description?, category?, lat, lng validés) | ✅ |
| PATCH | `/api/pois/:id` | éditer name/description/category | ✅ auteur |
| DELETE | `/api/pois/:id` | supprimer | ✅ auteur |
| POST | `/api/pois/:id/comments` | ajouter un commentaire | ✅ |
| DELETE | `/api/pois/comments/:commentId` | supprimer | ✅ auteur |
| POST | `/api/pois/:id/photos` | upload multipart `photo` (image, ≤5 Mo) | ✅ |
| DELETE | `/api/pois/photos/:photoId` | supprimer (DB **et fichier disque**) | ✅ auteur |
| GET | `/uploads/:file` | photos servies statiquement | – |

### Profil utilisateur — `server/src/routes/users.ts`
| Méthode | Route | Description | Auth |
|---|---|---|---|
| GET | `/api/me` | contenu du compte : `{ user, stats, pois, comments, photos }` ; **POI `demo` exclus en production** | ✅ |
| POST | `/api/me/avatar` | upload multipart `avatar` (image ≤5 Mo) → `avatarUrl` mis à jour, ancien fichier upload supprimé | ✅ |

## UX frontend — design & animations (implémenté)

### Direction artistique
- **Mobile-first**, carte plein écran comme point focal ; fond clair neutre (`#f8fafc`), accent **indigo** (`brand-600`), police **Inter**.
- **Tokens Tailwind** dans `tailwind.config.js` : palette `brand`, rayons (`rounded-2xl`/`3xl`), ombres `soft`/`float`, animations `fade-in`/`slide-up`.
- **Dark mode** : implémenté — `ThemeContext` (stratégie `class`), bascule ☀️/🌙 visible dans la **Navbar** et sur les pages Login/Register, **persistée** (`fihspot_theme`) avec fallback `prefers-color-scheme` + script anti-flash dans `index.html`. **La carte Google Maps suit le thème** : `colorScheme: 'DARK'/'LIGHT'` (option d'initialisation uniquement) → la carte est **recréée** au toggle (vue centrée/zoom préservés via `viewRef`, auto-localisation ne se relance pas grâce à `autoLocatedRef`).
- Overlays glassmorphism (Navbar, bannière "chargement"), focus rings accessibles, micro-hovers.

### Internationalisation (i18n) — implémenté
- **Langue par défaut : anglais** ; détection automatique : `localStorage['fihspot_lang']` → sinon `navigator.language` commençant par `fr` → **français**, sinon **anglais**. Initialisé dans `client/src/i18n/index.ts` (i18next + react-i18next).
- **Sélecteur EN/FR** (`LanguageToggle.tsx`) à côté du toggle ☀️/🌙 : Navbar, header du profil, pages Login/Register ; le choix est **persisté** (`fihspot_lang`).
- Tous les textes UI (boutons, placeholders, aria-labels, toasts, catégories, états vides, bannière hors-ligne) passent par `t('clé')` — dictionnaires `en.ts` / `fr.ts`. Plus aucun texte français codé en dur côté client (hors dictionnaire `fr`).
- **Locale dynamique** : `toLocaleDateString(i18n.language, …)` (dates) et Nominatim `accept-language=<langue>` (recherche) suivent la langue active.
- **Métadonnées** : `<html lang>` et `<title>` mis à jour à chaque changement de langue ; `index.html` et manifest PWA (`vite.config.ts`) en anglais par défaut (`lang: 'en'`).
- **Erreurs API localisées** : le serveur renvoie `{ error, code }` (message anglais + code stable) ; le client traduit `errors.<CODE>` dans la langue active (toasts et messages de formulaire).

### Animations (Framer Motion)
- **Transitions de page** : `AnimatePresence mode="wait"` + fade/slide entre routes.
- **Drawer/side-panel POI & AddPoiPanel** : spring — remonte depuis le bas en mobile (`y`), glisse depuis la droite en desktop (`x`, via `useMediaQuery`) ; backdrop fade.
- **FAB** : rotation `+` → `✕` (rotation 45°) et `active:scale-95`.
- **Formulaires** : shake horizontal des inputs en erreur, spinners (login/register, commentaire, upload).
- **Toasts** : slide-in/dismiss animés (success/error/info).
- **Marqueurs Google Maps (Advanced Markers)** : `AdvancedMarkerElement` + contenu HTML (`.marker-pin` pins catégorisés, anneau de sélection pulsant, points de localisation/recherche), `gmpClickable` + évènement `gmp-click` pour la sélection, `gmpClickable` des marqueurs décoratifs à `false`. Nécessite un **Map ID** (vecteur) — c'est aussi lui qui autorise `colorScheme`.
- **Skeletons** : fiche POI en chargement (shimmer).

### Responsive & ergonomie tactile
- **Mobile** : FAB d'ajout (bas droite, 56 px), drawer plein largeur en bas d'écran (`h-[85dvh]`), boutons ≥ 44 px, boutons delete photo visibles sans hover, safe-area inset.
- **FAB masqué quand une fiche POI est ouverte** (`!selectedId`) pour ne pas obstruer la vue ; réapparaît à la fermeture du drawer.
- **Localisation** : bouton 🎯 flottant **au-dessus du FAB "+"** (`bottom-24`), géolocalisation via **`navigator.geolocation`** → centrage sur l'utilisateur + **point bleu pulsant** (`userPosition`) ; toast d'erreur si localisation refusée/indisponible.
- **Page profil** (`/profile`, via le chip utilisateur dans la navbar) : avatar (upload 📷 → `POST /api/me/avatar`), nom/email/date d'inscription, compteurs, onglets **Points / Commentaires / Photos** ; clic sur un élément → `/?poi=<id>` → la carte se centre sur le POI et ouvre sa fiche (`pendingFocus` + `panTo`/`setZoom`).
- **Recherche ville/lieu** : barre `SearchBar` sous la Navbar (glass, debounce 350 ms) → **Nominatim** (`format=jsonv2`, monde entier, CORS OK) → dropdown (5 résultats) → `panTo` au lieu choisi + **marqueur de recherche** (point turquoise pulsant, `searchPosition`, non cliquable). Fermeture au clic extérieur/Escape. Recherche et bouton 🎯 masqués quand une fiche POI est ouverte ; le marqueur se retire quand on sélectionne un POI ou place un nouveau point.
- **Desktop** : side-panel 420 px à droite, carte visible à côté.
- États **chargement / vide / erreur** : loader plein écran, skeletons, bannière "Chargement des points…", toasts d'erreur.
- Carte : bouton géolocalisation 🎯 (recenter), bannière "Cliquez sur la carte" en mode ajout, **contrôle natif Carte/Satellite** (map type control, `mapTypeControl: true`) + **inclinaison 45°** automatique en vue satellite (paysage 3D) — `setTilt(45)`/`setTilt(0)` via `maptypeid_changed`.

## Hors-ligne & cache-first (PWA, implémenté)

### Objectif
- **Hors-ligne** : accès au site sans connexion — app shell, spots et fiches (photos + commentaires) restent consultables. **La carte Google Maps nécessite une connexion** (impossible de mettre en cache les tuiles Google ; l'API JS ne fonctionne pas hors-ligne).
- **En ligne** : les données POI sont servies **fraîches du serveur en priorité** (NetworkFirst) — le front et le cache sont toujours synchronisés avec le serveur (pas de commentaires/photos obsolètes).

### Mise en œuvre — `vite-plugin-pwa` (Workbox, `generateSW`)
- **Precache** de l'app shell : `**/*.{js,css,html,svg,png,webmanifest}` ; `navigateFallback: /index.html` (avec `denylist /api`, `/uploads`).
- **Manifest PWA** : name *FihSpot*, `theme_color #4f46e5`, `display standalone`, icônes 192/512 (+ maskable) et `apple-touch-icon` générées par `client/scripts/generate-icons.mjs` (sharp) — `npm run icons -w client`.
- **Runtime caching** (GET publics uniquement ; `/api/auth/*` jamais caché) :
  | Ressource | Stratégie | Limite |
  |---|---|---|
  | Liste `/api/pois` | NetworkFirst (timeout 3 s) | 50 / 7 j |
  | Fiche `/api/pois/:id` (photos + commentaires) | NetworkFirst (timeout 3 s) | 100 / 7 j |
  | Photos `/uploads/*` | CacheFirst | 500 / 30 j |
  *(le cache des tuiles OSM a été retiré avec la migration vers Google Maps)*
- **Fraîcheur des POI** : liste et fiches en **NetworkFirst** — en ligne, le serveur est interrogé en priorité et la réponse **met à jour le front (état React) et le cache SW** ; un POI/commentaire/photo supprimé côté serveur renvoie un `404` (non caché) qui ferme la fiche au lieu d'afficher des données obsolètes. Le cache ne sert que **hors-ligne** (ou si le réseau dépasse 3 s).
- **`registerSW({ immediate: true })`** dans `main.tsx` (auto-update).
- **nginx** : `sw.js` / `workbox-*.js` / `manifest.webmanifest` servis avec `Cache-Control: no-cache` + `Service-Worker-Allowed: /`.

### Session JWT persistante hors-ligne
- Token JWT + profil user (`fihspot_user`) stockés en localStorage.
- Au boot : le profil **caché s'affiche immédiatement**, `api.me()` revalide en arrière-plan ; un `401` seul déconnecte, une **erreur réseau conserve la session** (plus de `clearToken()` abusif).
- Retour en ligne (`online` event) → revalidation automatique de la session et des POI.

### Comportement hors-ligne
- **Lecture seule** : spots, fiches, photos et commentaires visités visibles ; bandeau `OfflineBanner` ("Hors ligne — affichage des données en cache"). La **carte Google Maps ne s'affiche pas sans connexion** (fond gris) mais les fiches restent consultables.
- **Écritures** (créer POI / commentaire / upload photo) : échouent avec un toast **« Pas de connexion »** (`ApiError(0)`).
- **Fade de rafraîchissement** : quand les données fraîches remplacent le cache, fondu doux sur le contenu du drawer (`PoiDrawer`) et sur les nouveaux marqueurs (`markerFadeIn` CSS).

## Statut & état
| Élément | État |
|---|---|
| Scaffold monorepo (workspaces, scripts, env, docker-compose, Dockerfiles) | ✅ implémenté |
| Schéma Prisma + migration `init` + seed (user démo + 5 POI) | ✅ implémenté |
| Auth email/mot de passe (JWT + bcrypt) + AuthContext + ProtectedRoute | ✅ implémenté |
| Google OAuth (endpoint serveur + GoogleButton client) | ✅ implémenté |
| Carte Google Maps (Advanced Markers, Map ID, bounds, géoloc, mode ajout, vue plan/satellite + inclinaison 45°) | ✅ implémenté |
| Fiche POI (drawer animé, commentaires, photos, bouton Google Maps, suppression) | ✅ implémenté |
| Ajout de POI (placement clic + formulaire) | ✅ implémenté |
| Design responsive + animations (transitions, toasts, skeleton, dark mode) | ✅ implémenté |
| **Dark mode** : toggle ☀️/🌙 visible (Navbar + pages auth) + persistance (`fihspot_theme`) + **la carte Google Maps suit le thème** (`colorScheme` DARK/LIGHT, recréée au toggle, vue préservée) | ✅ implémenté |
| **FAB masqué quand une fiche POI est ouverte** | ✅ implémenté |
| **Localisation utilisateur** : bouton 🎯 au-dessus du FAB + point bleu pulsant + centrage | ✅ implémenté |
| **Recherche ville/lieu** (Nominatim, debounce, dropdown, panTo + marqueur) | ✅ implémenté |
| **Page profil** (`/profile`) : avatar custom, stats, onglets points/commentaires/photos | ✅ implémenté |
| **Clic profil → POI sur la carte** (`/?poi=` + panTo + ouverture fiche) | ✅ implémenté |
| **PWA hors-ligne** (precache, manifest, icônes, headers nginx) | ✅ implémenté |
| **Cache hors-ligne + fraîcheur en ligne** (spots/fiches/photos, NetworkFirst + CacheFirst ; tuiles retirées car Google Maps requiert le réseau) | ✅ implémenté |
| **Session JWT hors-ligne** (profil en cache, pas de logout sur erreur réseau) | ✅ implémenté |
| **Uploads partagés dev/Docker** (bind mount) + suppression du fichier au delete photo/POI | ✅ implémenté |
| **OfflineBanner + lecture seule hors-ligne** + fade de rafraîchissement | ✅ implémenté |
| **Internationalisation** : anglais par défaut + auto-français (`navigator.language`) + sélecteur EN/FR persisté (`fihspot_lang`) | ✅ implémenté |
| **Erreurs API localisées** : codes d'erreur stables `{ error, code }` + traduction EN/FR côté client | ✅ implémenté |
| **POI de démo uniquement en dev** : flag `demo` (migration `add_poi_demo_flag`), exclus de l'API en production | ✅ implémenté |
| Stack Docker complète (`docker compose up --build` → :8080) | ✅ testé |
| Build client + serveur | ✅ OK |
| Compte de test | `demo@fihspot.app` / `demo1234` (seed dev uniquement) |

## À configurer / à faire (optionnel)
- **Google OAuth** : créer un projet Google Cloud, un OAuth Client ID, puis remplir `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (dans `server/.env` en dev, ou variables d'environnement Compose). Tant que vides, le bouton Google est masqué.
- **Google Maps** : clé API **Maps JavaScript API** (`VITE_GOOGLE_MAPS_API_KEY`) et **Map ID** (`VITE_GOOGLE_MAPS_MAP_ID`) à renseigner dans `.env` (racine, pour Docker) et `client/.env` (dev local). Le Map ID est obligatoire pour les Advanced Markers et le `colorScheme`. Restreindre la clé aux HTTP referrers `https://fihspot.com/*` / `https://www.fihspot.com/*`.
- **`JWT_SECRET`** : générer un secret fort et le définir (dev + Compose).
- **HTTPS** : le service worker PWA n'est actif qu'en HTTPS (ou localhost). En production réelle, configurer un certificat (ex. Caddy/Traefik) devant nginx.
- **Tests d'API** : supertest (non ajouté à ce jour).
- **Recherche / filtres par catégorie** sur la carte : prévus en roadmap, non implémentés.
