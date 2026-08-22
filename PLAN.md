# PLAN — FihSpot

## Objectif
Site web responsive mobile où les utilisateurs authentifiés ajoutent et consultent des **points d'intérêt** sur une carte. Un POI "focusé" affiche une fiche avec **commentaires**, **photos** et un bouton **"Ouvrir dans Google Maps"**. Site **en anglais par défaut** avec **traduction automatique en français** pour les visiteurs francophones (détection `navigator.language` + sélecteur FR/EN persistant).

> Statut : **implémenté et testé de bout en bout** (voir [Statut & état](#statut--état)).

## Stack
- **Frontend** : React 18 + TypeScript + Vite 6, React Router v7, **Google Maps JavaScript API** (`@googlemaps/js-api-loader`, **Advanced Markers** + Map ID), Tailwind CSS 3, Framer Motion, **i18next + react-i18next** (i18n anglais/français)
- **Backend** : Express 4 + TypeScript (tsx en dev, tsc → dist), Prisma ORM, JWT (jsonwebtoken), **helmet**, **express-rate-limit**
- **Auth** : email/mot-de-passe (bcryptjs) + Google OAuth (validation du `id_token` via `tokeninfo` avec contrôle strict de `aud`/`iss`/`email_verified`)
- **Photos** : upload local via `multer` 2.x (extension + **validation des magic bytes**), servi statiquement par Express (`/uploads`, en-têtes `nosniff` + CSP `sandbox`) ; les fichiers sont **partagés entre dev et Docker** via un bind mount (`./server/uploads`), et **supprimés du disque** quand une photo ou un POI est supprimé.
- **Base de données** : PostgreSQL 16 (Docker Compose)
- **Reverse proxy** : **Caddy 2** (TLS automatique, HSTS, CSP et en-têtes de sécurité) devant le client nginx
- **Monorepo** : npm workspaces (`client/` + `server/`), scripts racine

## Architecture

### Structure réelle du monorepo
```
FihSpot/
├── PLAN.md                       # ce document
├── SECURITY.md                   # audit sécurité complet + statut des correctifs
├── package.json                  # scripts racine (dev, build, db:migrate, db:seed, deploy, db:backup, db:restore)
├── package-lock.json
├── .env.example                  # modèle de config (PORT, JWT, DATABASE_URL, POSTGRES_*, GOOGLE_*, VITE_GOOGLE_MAPS_*)
├── .gitignore                    # ignore aussi backups/ (dumps SQL)
├── Caddyfile                     # TLS auto + HSTS + CSP/en-têtes de sécurité ; proxy → client nginx
├── docker-compose.yml            # stack complète : db + server + client (nginx) + caddy (80/443)
├── scripts/
│   ├── dev.sh                    # lancement dev avec vérification de l'env
│   ├── deploy.sh                 # déploiement/redeploy prod : validation env → build → up → health-check
│   ├── db-backup.sh              # pg_dump gzip horodaté dans backups/ + rétention (14 j par défaut)
│   └── db-restore.sh             # restauration d'un dump (confirmation obligatoire)
├── backups/                      # dumps DB (gitignoré)
├── client/
│   ├── Dockerfile                # multi-stage : build Vite → nginx
│   ├── nginx.conf                # SPA fallback + proxy /api et /uploads → server:3000 + cache HTTP (assets immutable, manifest no-cache)
│   ├── index.html                # fonts Inter, apple-touch-icon (plus de CSS Leaflet)
│   ├── vite.config.ts            # proxy dev /api + /uploads → localhost:3000 ; chunks vendor manuels (react, maps, motion…)
│   ├── tailwind.config.js        # tokens (palette brand, radii, ombres, dark mode class)
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── scripts/generate-icons.mjs  # génère les icônes PNG PWA depuis favicon.svg (sharp)
│   ├── public/
│   │   ├── favicon.svg
│   │   ├── pwa-192x192.png / pwa-512x512.png / apple-touch-icon.png
│   └── src/
│       ├── main.tsx              # bootstrap React + import i18n ; **sans service worker** (désactivé : iOS Safari le tue au relancement — HTTP caching à la place, anciennes registrations SW retirées)
│       ├── App.tsx               # AuthProvider + ToastProvider + router + transitions de page + OfflineBanner
│       ├── index.css             # Tailwind + styles Google Maps (marqueurs, dark map, marker fade)
│       ├── vite-env.d.ts         # types vite + @types/google.maps + ImportMetaEnv
│       ├── lib/
│       │   ├── googleMaps.ts     # loader Google Maps (@googlemaps/js-api-loader, library "marker") + export MAP_ID + type LatLng + scanTileUrl() (tuiles proxifiées par le serveur) + staticMapUrl()
│       │   ├── waterScan.ts      # scan d'eau : découpage en tuiles Static Maps (grille Web-Mercator), pool de workers, fusion des candidats
│       │   ├── waterAnalysis.ts  # détection des plans d'eau par analyse de pixels (couleur eau, régions, seuils)
│       │   └── waterWorker.ts    # worker (OffscreenCanvas) qui analyse une tuile hors du thread principal
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
│       │   ├── SearchSessionContext.tsx # état d'une session de recherche de spot (scan en cours, candidats, sélection)
│       │   ├── ToastContext.tsx  # toasts animés (AnimatePresence)
│       │   └── ThemeContext.tsx  # thème light/dark persisté (localStorage) + class "dark" ; pilote aussi le colorScheme de la carte
│       ├── hooks/useMediaQuery.ts
│       ├── components/
│       │   ├── Navbar.tsx        # barre solide + compacte sur petits écrans (< lg) : icônes uniformes (h-10 w-10), type de carte icônes seules ; flottante glassmorphism sur ≥ lg (fond transparent, boutons verre) ; déconnexion en icône mobile / texte desktop
│       │   ├── ThemeToggle.tsx   # bouton ☀️/🌙 (basculer le thème, y compris celui de la carte)
│       │   ├── LanguageToggle.tsx # bouton EN/FR (basculer la langue, persisté)
│       │   ├── MapTypeToggle.tsx # contrôle custom Carte/Satellite (remplace le contrôle natif Google Maps)
│       │   ├── SearchBar.tsx     # recherche ville/lieu (**proxifiée par le backend** `/api/geocode` — plus d'appel Nominatim direct, debounce, dropdown)
│       │   ├── SearchPanel.tsx   # panneau des recherches de spots sauvegardées (scan, candidats, enregistrement)
│       │   ├── UserLocationButton.tsx # localisation (navigator.geolocation) + centrage (bas droite)
│       │   ├── OfflineBanner.tsx # bandeau "Hors ligne — données en cache"
│       │   ├── AdminRoute.tsx    # garde de route réservée au rôle ADMIN
│       │   ├── GoogleMapView.tsx # carte Google Maps (Advanced Markers, bounds, géoloc, ajout au clic, colorScheme, minZoom + restriction, mapType)
│       │   ├── PoiDrawer.tsx     # fiche POI (drawer mobile / side-panel desktop) + fade au refresh + bouton "Voir sur la carte" (optionnel) + avatars commentaires + photos agrandissables (lightbox, auteur)
│       │   ├── AddPoiPanel.tsx   # formulaire création après placement sur la carte
│       │   ├── GoogleButton.tsx  # Google Identity Services (bouton "Continuer avec Google")
│       │   ├── ProtectedRoute.tsx
│       │   ├── Button.tsx / Input.tsx / Logo.tsx / Spinner.tsx
│       └── pages/
│           ├── MapPage.tsx       # page principale : carte + drawer + recherche de spots (scan d'eau) + états (+ focus ?poi= + centrage ?lat&lng&zoom)
│           ├── PoisPage.tsx      # page POIs (grille) : recherche + tri + mini-cartes (Static API) + drawer détail
│           ├── ProfilePage.tsx   # profil : avatar upload, stats, onglets points/commentaires/photos
│           ├── UserPage.tsx      # profil public d'un autre utilisateur (/users/:id)
│           ├── AdminPage.tsx     # back-office admin : stats, gestion users/POIs, modération commentaires/photos
│           ├── LoginPage.tsx
│           └── RegisterPage.tsx
└── server/
    ├── Dockerfile                # multi-stage : npm ci → build tsc → node dist (utilisateur non-root `node`)
    ├── package.json
    ├── tsconfig.json
    ├── .env                      # config locale de dev (gitignoré)
    ├── prisma/
    │   ├── schema.prisma
    │   ├── migrations/           # init, poi_demo_flag, user_role, search_seen, search_zoom, search_access, location_sharing
    │   └── seed.ts               # user démo + 5 POI à Marseille (demo=true, contenus en anglais)
    ├── uploads/                  # photos (volume Docker, gitignoré)
    └── src/
        ├── index.ts              # bootstrap listen
        ├── app.ts                # createApp() : helmet, CORS, JSON, rate limit global, routes, statique (/uploads avec nosniff + CSP sandbox), error handler
        ├── config.ts             # lecture .env ; **JWT_SECRET obligatoire (≥32 caractères) en production** ; demoEnabled = NODE_ENV !== 'production'
        ├── prisma.ts             # singleton PrismaClient
        ├── types.ts              # augmentation Express.Request.user
        ├── middleware/
        │   ├── auth.ts           # requireAuth / optionalAuth / requireSearchAccess / requireAdmin
        │   ├── upload.ts         # multer (jpeg/png/webp/gif, 5 Mo) + validateImageUpload (**magic bytes**, SVG rejeté)
        │   ├── rateLimit.ts      # limiteurs express-rate-limit : global, auth, register, scan tiles
        │   └── errorHandler.ts   # ApiError (status, message, code) + MulterError + fallback 500
        ├── routes/
        │   ├── auth.ts           # register/login/google/me/config ; Google: vérif aud/iss/email_verified ; rate limits sur login/register/google
        │   ├── pois.ts           # CRUD POI + commentaires + photos + marquage "vu" ; exclusion des POI demo en prod ; caps de pagination
        │   ├── users.ts          # /api/me (contenu user) + /api/me/avatar + /api/users/:id (profil public)
        │   ├── searches.ts       # recherches sauvegardées (requireSearchAccess)
        │   ├── scan.ts           # proxy + cache serveur des tuiles Static Maps pour le scan d'eau (requireSearchAccess + rate limit)
        │   ├── locations.ts      # partage de position live (préférence persistée, positions en mémoire, TTL 60 s)
        │   ├── admin.ts          # back-office : stats, users, POIs, modération (requireAdmin)
        │   └── geocode.ts        # proxy Nominatim avec cache mémoire (le client ne parle jamais au service tiers)
        ├── services/
        │   ├── search.ts         # findPoisInBounds (cap 2000) + viewportBounds (zoom → bbox)
        │   └── content.ts        # suppressions en cascade POI/commentaires/photos + fichiers disque
        └── utils/
            ├── jwt.ts            # signToken / verifyToken
            ├── password.ts       # bcrypt hash / compare
            ├── serialize.ts      # publicUser (profil sérialisé)
            ├── admin.ts          # isAdminEmail + syncAdminRole (promotion auto des ADMIN_EMAILS)
            ├── validate.ts       # assertMaxLength (garde-fou longueur des champs texte)
            └── files.ts          # unlinkUpload (suppression fichier upload)
```

### Modèle de données (Prisma — implémenté)
- **User** : `id` (cuid), `email` (unique), `passwordHash?`, `googleId?` (unique), `name`, `avatarUrl?`, `role` (`USER`/`ADMIN`, défaut `USER` ; promotion auto des `ADMIN_EMAILS` à la connexion), `searchEnabled` (accès à la recherche de spots, accordé par un admin), `shareLocation` (partage de position live), `createdAt`
- **PoI** : `id`, `name`, `description?`, `lat`, `lng`, `category?`, `demo` (booléen, défaut `false` — POI de démonstration), `createdById → User`, `createdAt`, `updatedAt` ; index `[lat, lng]`
- **Comment** : `id`, `content`, `userId → User`, `poiId → PoI` (onDelete: Cascade), `createdAt`
- **Photo** : `id`, `url`, `userId → User`, `poiId → PoI` (onDelete: Cascade), `createdAt`
- **Search** : recherches sauvegardées (`userId → User`, `name`, `lat`, `lng`, `zoom`)
- **SeenPoi** : marquage "vu" par utilisateur (`@@unique([userId, poiId])`, `seenAt`)

Relations : User `1-n` PoI/Comment/Photo ; PoI `1-n` Comment/Photo.

## Docker Compose & déploiement production (implémenté)

```yaml
services:
  db:      # postgres:16-alpine, volume pgdata, healthcheck pg_isready ; identifiants paramétrables via POSTGRES_USER/PASSWORD/DB
  server:  # Dockerfile server (non-root), env injectée depuis .env, bind mount ./server/uploads, PAS de port exposé
  client:  # Dockerfile client (nginx), PAS de port exposé ; build ARGs VITE_GOOGLE_MAPS_API_KEY / VITE_GOOGLE_MAPS_MAP_ID
  caddy:   # caddy:2-alpine, ports 80/443 : TLS automatique, HTTP→HTTPS, HSTS, CSP et en-têtes de sécurité ; proxy → client:80
volumes:
  pgdata, caddy_data, caddy_config, scan_cache
```

**Production tourne sur ce serveur** : `https://fihspot.com` (Caddy). Le client nginx fait le fallback SPA + reverse proxy `/api/` et `/uploads/` vers `server:3000`.

| Command | Description |
|---|---|
| `npm run dev` | Dev local : server (tsx watch :3000) + client (Vite :5173, proxy) |
| `npm run db:migrate` / `db:seed` | Migration Prisma + seed de démo |
| **`npm run deploy`** | Déployer/redeployer la prod : validation env → `docker compose build --pull` → `up -d` → health-check `/api/health` → prune images. Flag `--skip-build` |
| **`npm run db:backup`** | Dump gzip horodaté dans `backups/` + rétention (`BACKUP_RETENTION_DAYS`, défaut 14) — à cronner |
| **`npm run db:restore <fichier>`** | Restauration d'un dump (confirmation obligatoire + restart du server) |

- **POI de démo visibles uniquement en dev** : le seed crée des POI avec `demo = true` ; l'API les exclut quand `NODE_ENV=production`. En dev local, `NODE_ENV` n'est pas défini → les POI de démo s'affichent.
- Au démarrage en Docker, le server exécute `prisma migrate deploy` avant `node dist/index.js`.
- Le serveur **refuse de démarrer** si `JWT_SECRET` n'est pas défini (≥ 32 caractères) en production ; docker-compose l'exige aussi (`${JWT_SECRET:?}`).
- Config serveur injectée via variables d'environnement : `DATABASE_URL` dérivée des `POSTGRES_*`, `JWT_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_MAPS_SERVER_KEY` (proxy tuiles scan), `CLIENT_URL`.
- Config Google Maps (client) injectée au build via ARG : `VITE_GOOGLE_MAPS_API_KEY` + `VITE_GOOGLE_MAPS_MAP_ID` (lues depuis `.env` racine). En dev local, Vite lit `client/.env` (voir `client/.env.example`).
- Les uploads montés depuis l'hôte doivent appartenir à uid 1000 (`chown -R 1000:1000 server/uploads`) car le conteneur serveur tourne en non-root.
- Détails sécurité : voir [SECURITY.md](SECURITY.md).

## API (implémentée)
> **Erreurs** : toutes les réponses d'erreur sont `{ error, code }` — message **en anglais par défaut** + **code machine stable** (ex. `EMAIL_TAKEN`, `POI_NOT_FOUND`, `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `IMAGE_TYPE_UNSUPPORTED`). Le client traduit `code` → message localisé (`errors.<CODE>` dans les dictionnaires EN/FR) ; fallback sur `error` si code inconnu. `ApiError` (serveur) et `ApiError` (client) portent tous deux un `code`.

### Auth — `server/src/routes/auth.ts`
| Méthode | Route | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | email + mot de passe + nom → `{ token, user }` ; **rate limit 5/h/IP** ; caps longueur (nom ≤100, email ≤254, mdp ≤100) | – |
| POST | `/api/auth/login` | email + mot de passe → `{ token, user }` ; **rate limit 10/15 min/IP** | – |
| POST | `/api/auth/google` | `{ idToken }` Google → vérif `tokeninfo` **+ contrôle `aud` = GOOGLE_CLIENT_ID, `iss` Google, `email_verified`** (seuls les emails vérifiés lient un compte) → `{ token, user }` | – |
| GET | `/api/auth/me` | profil courant | ✅ |
| GET | `/api/auth/config` | `{ googleClientId }` pour le bouton Google | – |

### Points d'intérêt — `server/src/routes/pois.ts`
| Méthode | Route | Description | Auth |
|---|---|---|---|
| GET | `/api/pois` | liste + `_count` comments/photos ; filtres bounds `?swLat&swLng&neLat&neLng` ; `?lastComment=1` → inclut le dernier commentaire (`take:1`, desc) ; **exclut les POI `demo` en production** ; **cap 2000 résultats** | – |
| GET | `/api/pois/:id` | détail complet (createdBy, comments ≤200, photos ≤200) ; **404 si `demo` et `NODE_ENV=production`** | – |
| POST | `/api/pois` | créer (name, description?, category?, lat, lng validés) | ✅ |
| PATCH | `/api/pois/:id` | éditer name/description/category | ✅ auteur |
| DELETE | `/api/pois/:id` | supprimer | ✅ auteur |
| POST | `/api/pois/:id/comments` | ajouter un commentaire | ✅ |
| DELETE | `/api/pois/comments/:commentId` | supprimer | ✅ auteur |
| POST | `/api/pois/:id/photos` | upload multipart `photo` (jpeg/png/webp/gif, ≤5 Mo, **magic bytes vérifiés**) | ✅ |
| DELETE | `/api/pois/photos/:photoId` | supprimer (DB **et fichier disque**) | ✅ auteur |
| GET | `/uploads/:file` | photos servies statiquement (`nosniff` + CSP `sandbox`) | – |

### Marquage "vu" — `pois.ts`
| Méthode | Route | Description | Auth |
|---|---|---|---|
| POST / DELETE | `/api/pois/:id/seen` | marquer / démarquer un POI comme vu (upsert/delete `SeenPoi`) | ✅ + accès recherche |

### Profil utilisateur — `server/src/routes/users.ts`
| Méthode | Route | Description | Auth |
|---|---|---|---|
| GET | `/api/me` | contenu du compte : `{ user, stats, pois, comments, photos }` (listes cap 200) ; **POI `demo` exclus en production** | ✅ |
| GET | `/api/users/:id` | profil public d'un utilisateur (sans email) + son contenu (cap 200) | – |
| POST | `/api/me/avatar` | upload multipart `avatar` (image ≤5 Mo) → `avatarUrl` mis à jour, ancien fichier upload supprimé | ✅ |

### Recherche de spots — `server/src/routes/searches.ts` (+ `scan.ts`)
> Réservées aux admins et aux users avec `searchEnabled` (`requireSearchAccess`).

| Méthode | Route | Description | Auth |
|---|---|---|---|
| GET / POST | `/api/searches` | lister / créer une recherche sauvegardée (name, lat, lng, zoom) | ✅ accès |
| GET / PATCH / DELETE | `/api/searches/:id` | détail (+ POIs de la zone) / renommer / supprimer — **propriétaire uniquement** | ✅ accès |
| GET | `/api/scan/tile?lat&lng&zoom&size&scale` | tuile Static Maps **proxifiée et cachée par le serveur** (clé Google jamais exposée, cache LRU ~8000 fichiers) ; **rate limit 600/15 min** | ✅ accès |

### Position live — `server/src/routes/locations.ts`
| Méthode | Route | Description | Auth |
|---|---|---|---|
| POST | `/api/locations/share` | activer/désactiver le partage (`{ enabled }`, persisté) | ✅ |
| POST | `/api/locations` | reporter sa position (mémoire vive, TTL 60 s) | ✅ |
| GET | `/api/locations` | positions live de tous les utilisateurs qui partagent (choix produit assumé) | ✅ |

### Géocodage — `server/src/routes/geocode.ts`
| Méthode | Route | Description | Auth |
|---|---|---|---|
| GET | `/api/geocode?q&lang` | proxy Nominatim (User-Agent dédié, cache mémoire 24 h/500 entrées, rate limit 120/15 min) — le navigateur n'appelle plus le service tiers | – |

### Back-office — `server/src/routes/admin.ts` (toutes : `requireAdmin`)
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/admin/stats` | compteurs globaux + 5 derniers inscrits |
| GET / PATCH / DELETE | `/api/admin/users(/:id)` | gestion des comptes (rôle, `searchEnabled`, reset mdp, suppression avec contenu) ; auto-demotion impossible |
| GET / PATCH / DELETE | `/api/admin/pois(/:id)` | gestion des POIs (dont flag `demo`) |
| GET | `/api/admin/moderation?type=comments\|photos` | dernière modération (50) |
| DELETE | `/api/admin/comments/:id` · `/photos/:id` | modération |

## UX frontend — design & animations (implémenté)

### Direction artistique
- **Mobile-first**, carte plein écran comme point focal ; fond clair neutre (`#f8fafc`), accent **indigo** (`brand-600`), police **Inter**.
- **Tokens Tailwind** dans `tailwind.config.js` : palette `brand`, rayons (`rounded-2xl`/`3xl`), ombres `soft`/`float`, animations `fade-in`/`slide-up`.
- **Dark mode** : implémenté — `ThemeContext` (stratégie `class`), bascule ☀️/🌙 visible dans la **Navbar** et sur les pages Login/Register, **persistée** (`fihspot_theme`) avec fallback `prefers-color-scheme` + script anti-flash dans `index.html`. **La carte Google Maps suit le thème** : `colorScheme: 'DARK'/'LIGHT'` (option d'initialisation uniquement) → la carte est **recréée** au toggle (vue centrée/zoom préservés via `viewRef`, auto-localisation ne se relance pas grâce à `autoLocatedRef`).
- Overlays glassmorphism (bannière "chargement"), focus rings accessibles, micro-hovers. **Navbar** : sur écran étroit (< `lg`) barre **solide** (fond opaque `bg-white`/`dark:bg-slate-800`, bordure basse) avec **icônes uniformes** bien espacées (pas de hamburger) ; sur `≥ lg` elle **flotte** au-dessus de la carte (fond transparent, boutons verre `bg-white/80` + `backdrop-blur`).

### Internationalisation (i18n) — implémenté
- **Langue par défaut : anglais** ; détection automatique : `localStorage['fihspot_lang']` → sinon `navigator.language` commençant par `fr` → **français**, sinon **anglais**. Initialisé dans `client/src/i18n/index.ts` (i18next + react-i18next).
- **Sélecteur EN/FR** (`LanguageToggle.tsx`) à côté du toggle ☀️/🌙 : Navbar, header du profil, pages Login/Register ; le choix est **persisté** (`fihspot_lang`).
- Tous les textes UI (boutons, placeholders, aria-labels, toasts, catégories, états vides, bannière hors-ligne) passent par `t('clé')` — dictionnaires `en.ts` / `fr.ts`. Plus aucun texte français codé en dur côté client (hors dictionnaire `fr`).
- **Locale dynamique** : `toLocaleDateString(i18n.language, …)` (dates) et `accept-language` du géocodage (proxifié) suivent la langue active.
- **Métadonnées** : `<html lang>` et `<title>` mis à jour à chaque changement de langue ; `index.html` et `manifest.webmanifest` en anglais par défaut (`lang: 'en'`).
- **Erreurs API localisées** : le serveur renvoie `{ error, code }` (message anglais + code stable) ; le client traduit `errors.<CODE>` dans la langue active (toasts et messages de formulaire).

### Animations (Framer Motion)
- **Transitions de page** : `AnimatePresence mode="wait"` + fade/slide entre routes.
- **Drawer/side-panel POI & AddPoiPanel** : spring — remonte depuis le bas en mobile (`y`), glisse depuis la droite en desktop (`x`, via `useMediaQuery`) ; backdrop fade.
- **Ajout de POI permanent** : plus de bouton "+" ni de mode — un **clic simple sur la carte** ouvre directement le formulaire d'ajout (`AddPoiPanel`) au point cliqué.
- **Formulaires** : shake horizontal des inputs en erreur, spinners (login/register, commentaire, upload).
- **Toasts** : slide-in/dismiss animés (success/error/info).
- **Marqueurs Google Maps (Advanced Markers)** : `AdvancedMarkerElement` + contenu HTML (`.marker-pin` pins **icône poisson** `faFish` (pêche), anneau de sélection pulsant, points de localisation/recherche), `gmpClickable` + évènement `gmp-click` pour la sélection, `gmpClickable` des marqueurs décoratifs à `false`. Nécessite un **Map ID** (vecteur) — c'est aussi lui qui autorise `colorScheme`.
- **Skeletons** : fiche POI en chargement (shimmer) + grille de la page POIs.
- **Page POIs** : grille responsive avec **layout animations** (entrée/sortie/`layout` des cartes au filtrage) — `PoisPage.tsx`.

### Responsive & ergonomie tactile
- **Mobile** : drawer plein largeur en bas d'écran (`h-[85dvh]`), boutons ≥ 44 px, boutons delete photo visibles sans hover, safe-area inset.
- **Ajout de POI** : clic sur la carte → formulaire d'ajout (plus de FAB "+", plus de mode activé/désactivé).
- **Localisation** : bouton 🎯 flottant **bas droite** (`bottom-24 right-4`), géolocalisation via **`navigator.geolocation`** → centrage sur l'utilisateur + **point bleu pulsant** (`userPosition`) ; toast d'erreur si localisation refusée/indisponible.
- **Page profil** (`/profile`, via le chip utilisateur dans la navbar) : avatar (upload 📷 → `POST /api/me/avatar`), nom/email/date d'inscription, compteurs, onglets **Points / Commentaires / Photos** ; clic sur un élément → `/?poi=<id>` → la carte se centre sur le POI et ouvre sa fiche (`pendingFocus` + `panTo`/`setZoom`).
- **Recherche ville/lieu** : barre `SearchBar` sous la Navbar (glass, debounce 350 ms) → **`GET /api/geocode`** (proxy backend, monde entier) → dropdown (5 résultats) → `panTo` au lieu choisi + **marqueur de recherche** (point turquoise pulsant, `searchPosition`, non cliquable). Fermeture au clic extérieur/Escape. Recherche et bouton 🎯 masqués quand une fiche POI est ouverte ; le marqueur se retire quand on sélectionne un POI ou place un nouveau point.
- **Desktop** : side-panel 420 px à droite, carte visible à côté.
- États **chargement / vide / erreur** : loader plein écran, skeletons, bannière "Chargement des points…", toasts d'erreur.
- Carte : bouton géolocalisation 🎯 (recenter), **contrôle custom Carte/Satellite** (`MapTypeToggle`, `mapTypeControl: false`) dans la Navbar + **inclinaison 45°** automatique en vue satellite (paysage 3D) — `setTilt(45)`/`setTilt(0)` via `maptypeid_changed`.
- **Carte sans répétition du monde** : `minZoom` dynamique (`ceil(log2(largeur/256))`) + `restriction { latLngBounds: ±85°/±180°, strictBounds: true }` → impossible de dézoomer ou glisser vers les textures dupliquées.
- **Page POIs** (`/pois`, bouton « Explorer » dans la Navbar) : barre de **recherche** (nom+description, debounce), **tri** (récents / plus commentés), **grille** `sm:2 lg:3 xl:4` de cartes POI. Chaque carte : **mini-carte** (Google Maps **Static API** via `staticMapUrl()`, fallback dégradé bleu + icône poisson si erreur) avec **bouton « agrandir »** (`faExpand`) en bas à droite → **ouvre directement sur la carte** (`/?lat=<lat>&lng=<lng>&zoom=17`, centrage sans détails, géré par `pendingCenterRef` dans `MapPage`) ; corps de la carte : nom, description (clampée), **dernier commentaire** (si présent), auteur/avatar + date, compteurs 💬/📷. Clic sur la carte → **drawer de détail sur place** (`PoiDrawer`, photos/commentaires réutilisés) + bouton **« Voir sur la carte »** (`onViewOnMap`).

## Cache & fraîcheur des données (implémenté)

> **Le service worker / PWA Workbox a été retiré.** iOS Safari tue le service worker
> quand l'app est fermée puis relancée, ce qui ralentissait chaque lancement (et
> cassait l'app home-screen). `main.tsx` **désenregistre** maintenant toute
> registration résiduelle ; la fraîcheur repose sur le **cache HTTP** :
> - assets Vite hachés : `Cache-Control: immutable` (1 an) — nginx `/assets/`
> - `index.html`, manifest, SW éventuels : `no-cache`
> - manifest webmanifest conservé pour "Ajouter à l'écran d'accueil" (MIME `application/manifest+json`)
- **Fraîcheur des POI** : la liste est revalidée au lancement — le front affiche le cache localStorage (`fihspot_pois`) instantanément puis remplace par les données fraîches du réseau.
- **Session JWT persistante** : token + profil (`fihspot_user`) en localStorage ; au boot le profil caché s'affiche immédiatement et `api.me()` revalide en arrière-plan (un `401` seul déconnecte).
- **OfflineBanner** : bandeau "Hors ligne" quand `navigator.onLine` passe à false ; les requêtes échouées renvoient `ApiError(0)` → toast « Pas de connexion ».
- **Timeout client** : toute requête API aborte après 15 s (évite les appels coincés dans le SW résiduel sur iOS).

## Statut & état
| Élément | État |
|---|---|
| Scaffold monorepo (workspaces, scripts, env, docker-compose, Dockerfiles) | ✅ implémenté |
| Schéma Prisma + migration `init` + seed (user démo + 5 POI) | ✅ implémenté |
| Auth email/mot de passe (JWT + bcrypt) + AuthContext + ProtectedRoute | ✅ implémenté |
| Google OAuth (endpoint serveur + GoogleButton client) | ✅ implémenté |
| Carte Google Maps (Advanced Markers, Map ID, bounds, géoloc, mode ajout, vue plan/satellite + inclinaison 45°) | ✅ implémenté |
| **Contrôle Carte/Satellite custom** (`MapTypeToggle` dans la Navbar, contrôle natif désactivé) | ✅ implémenté |
| **Carte sans textures dupliquées** (`minZoom` dynamique + `restriction` `strictBounds`) | ✅ implémenté |
| Fiche POI (drawer animé, commentaires, photos, bouton Google Maps, suppression) | ✅ implémenté |
| **Photos agrandissables** (lightbox plein écran, bouton `faExpand`, auteur + date) + **avatars dans les commentaires** (`avatarUrl` des auteurs incluse par l'API) | ✅ implémenté |
| Ajout de POI (clic sur la carte → formulaire, sans FAB ni mode) | ✅ implémenté |
| Design responsive + animations (transitions, toasts, skeleton, dark mode) | ✅ implémenté |
| **Dark mode** : toggle ☀️/🌙 visible (Navbar + pages auth) + persistance (`fihspot_theme`) + **la carte Google Maps suit le thème** (`colorScheme` DARK/LIGHT, recréée au toggle, vue préservée) | ✅ implémenté |
| **Localisation utilisateur** : bouton 🎯 (bas droite) + point bleu pulsant + centrage | ✅ implémenté |
| **Recherche ville/lieu** (géocodage proxifié, debounce, dropdown, panTo + marqueur) | ✅ implémenté |
| **Page profil** (`/profile`) : avatar custom, stats, onglets points/commentaires/photos | ✅ implémenté |
| **Clic profil → POI sur la carte** (`/?poi=` + panTo + ouverture fiche) | ✅ implémenté |
| **Page POIs** (`/pois`) : grille + mini-cartes (Static API, fallback) + recherche + tri + drawer détail + bouton « Voir sur la carte » + bouton « agrandir » (→ carte, centrage `?lat&lng&zoom`) | ✅ implémenté |
| **Catégories supprimées de l'UI** (POI = pêche uniquement) : icône **poisson** `faFish` sur les marqueurs + fallback des mini-cartes ; champ `category` conservé en DB mais non utilisé | ✅ implémenté |
| **Dernier commentaire** dans la liste (`?lastComment=1` sur `GET /api/pois`) | ✅ implémenté |
| **PWA retirée** : plus de service worker (iOS Safari) — HTTP caching (`immutable` assets) + unregister des anciennes SW | ✅ implémenté |
| **Cache local + fraîcheur en ligne** (cache localStorage `fihspot_pois` affiché instantanément, revalidé au boot) | ✅ implémenté |
| **Session JWT hors-ligne** (profil en cache, pas de logout sur erreur réseau) | ✅ implémenté |
| **Uploads partagés dev/Docker** (bind mount) + suppression du fichier au delete photo/POI | ✅ implémenté |
| **OfflineBanner** + toast « Pas de connexion » sur échec réseau | ✅ implémenté |
| **Internationalisation** : anglais par défaut + auto-français (`navigator.language`) + sélecteur EN/FR persisté (`fihspot_lang`) | ✅ implémenté |
| **Erreurs API localisées** : codes d'erreur stables `{ error, code }` + traduction EN/FR côté client | ✅ implémenté |
| **POI de démo uniquement en dev** : flag `demo` (migration `add_poi_demo_flag`), exclus de l'API en production | ✅ implémenté |
| Stack Docker complète derrière **Caddy** (TLS auto, HSTS, CSP) → **https://fihspot.com** en production | ✅ en prod |
| Build client + serveur | ✅ OK |
| **Recherche de spots** (scan d'eau par tuiles Static Maps proxifiées + cachées serveur, analyse pixel en Web Workers, candidats cliquables) | ✅ implémenté |
| **Recherches sauvegardées** (`/api/searches`, accès `searchEnabled` accordé par un admin) | ✅ implémenté |
| **Partage de position live** (`/api/locations`, opt-in, TTL 60 s, marqueurs avatars) | ✅ implémenté |
| **Back-office admin** (`/api/admin/*` + AdminPage : stats, users, POIs, modération) | ✅ implémenté |
| **Géocodage proxifié** (`/api/geocode`, cache mémoire — plus d'appel tiers direct) | ✅ implémenté |
| **Durcissement sécurité** (JWT secret obligatoire, vérif Google aud/iss/email_verified, magic bytes uploads sans SVG, rate limits, CSP/en-têtes, caps pagination et longueurs) — détail dans [SECURITY.md](SECURITY.md) | ✅ déployé |
| **Scripts d'exploitation** (`deploy`, `db:backup`, `db:restore`, `dev.sh`) | ✅ implémentés |
| Compte de test | `demo@fihspot.app` / `demo1234` (seed dev uniquement) |

## À configurer / à faire (optionnel)
- **Google OAuth** : remplir `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` dans `.env`. Tant que vides, le bouton Google est masqué. (La vérification serveur du `aud` s'activera automatiquement dès que `GOOGLE_CLIENT_ID` est défini.)
- **Restriction des clés Google Maps** : une **clé serveur dédiée** (`GOOGLE_MAPS_SERVER_KEY`) est en place, restreinte par IP (IPv4 + IPv6 du VPS) et limitée à *Maps Static API*. Restreindre aussi la clé client (`VITE_GOOGLE_MAPS_API_KEY`) aux HTTP referrers `https://fihspot.com/*` côté Google Cloud.
- **Tests d'API** : supertest (non ajouté à ce jour).
- **Backups DB** : cronner `npm run db:backup` (ex. quotidien 4 h) — le script gère la rétention.
- **Suite sécurité (basse priorité, voir SECURITY.md)** : refresh tokens / révocation de session, mitigation de l'énumération d'emails, sessions par cookies HttpOnly.
