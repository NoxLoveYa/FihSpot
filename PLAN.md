# PLAN — FihSpot

## Objectif
Site web responsive mobile où les utilisateurs authentifiés ajoutent et consultent des **points d'intérêt** sur une carte. Un POI "focusé" affiche une fiche avec **commentaires**, **photos** et un bouton **"Ouvrir dans Google Maps"**.

> Statut : **implémenté et testé de bout en bout** (voir [Statut & état](#statut--état)).

## Stack
- **Frontend** : React 18 + TypeScript + Vite 6, React Router v7, `react-leaflet` + Leaflet 1.9, Tailwind CSS 3, Framer Motion
- **Backend** : Express 4 + TypeScript (tsx en dev, tsc → dist), Prisma ORM, JWT (jsonwebtoken)
- **Auth** : email/mot-de-passe (bcryptjs) + Google OAuth (flux serveur, validation du token via `tokeninfo`)
- **Photos** : upload local via `multer` 2.x, servi statiquement par Express (`/uploads`)
- **Base de données** : PostgreSQL 16 (Docker Compose)
- **Monorepo** : npm workspaces (`client/` + `server/`), scripts racine

## Architecture

### Structure réelle du monorepo
```
FihSpot/
├── PLAN.md                       # ce document
├── package.json                  # scripts racine (dev, build, db:migrate, db:seed)
├── package-lock.json
├── .env.example                  # modèle de config (PORT, JWT, DATABASE_URL, GOOGLE_*)
├── .gitignore
├── docker-compose.yml            # stack complète : db + server + client (nginx)
├── client/
│   ├── Dockerfile                # multi-stage : build Vite → nginx
│   ├── nginx.conf                # SPA fallback + proxy /api et /uploads → server:3000
│   ├── index.html                # fonts Inter, CSS Leaflet
│   ├── vite.config.ts            # proxy dev /api + /uploads → localhost:3000
│   ├── tailwind.config.js        # tokens (palette brand, radii, ombres, dark mode class)
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── public/favicon.svg
│   └── src/
│       ├── main.tsx              # bootstrap React
│       ├── App.tsx               # AuthProvider + ToastProvider + router + transitions de page
│       ├── index.css             # Tailwind + styles Leaflet (marqueurs, dark map, reduced-motion)
│       ├── api/
│       │   ├── client.ts         # wrapper fetch + gestion token JWT (localStorage) + ApiError
│       │   └── types.ts          # User, PoI, PoISummary, Comment, Photo, Bounds
│       ├── context/
│       │   ├── AuthContext.tsx   # login/register/googleLogin/logout + restauration session
│       │   └── ToastContext.tsx  # toasts animés (AnimatePresence)
│       ├── hooks/useMediaQuery.ts
│       ├── components/
│       │   ├── Navbar.tsx        # overlay glassmorphism sur la carte
│       │   ├── MapView.tsx       # carte Leaflet, marqueurs par catégorie, bounds, géoloc, mode ajout
│       │   ├── PoiDrawer.tsx     # fiche POI (drawer mobile / side-panel desktop)
│       │   ├── AddPoiPanel.tsx   # formulaire création après placement sur la carte
│       │   ├── GoogleButton.tsx  # Google Identity Services (bouton "Continuer avec Google")
│       │   ├── ProtectedRoute.tsx
│       │   ├── Button.tsx / Input.tsx / Logo.tsx / Spinner.tsx
│       └── pages/
│           ├── MapPage.tsx       # page principale : carte + drawer + FAB + états
│           ├── LoginPage.tsx
│           └── RegisterPage.tsx
└── server/
    ├── Dockerfile                # multi-stage : npm ci → build tsc → node dist
    ├── package.json
    ├── tsconfig.json
    ├── .env                      # config locale de dev (gitignoré)
    ├── prisma/
    │   ├── schema.prisma
    │   ├── migrations/           # 20260812054708_init
    │   └── seed.ts               # user démo + 5 POI à Marseille
    ├── uploads/                  # photos (volume Docker, gitignoré)
    └── src/
        ├── index.ts              # bootstrap listen
        ├── app.ts                # createApp() : CORS, JSON, routes, statique, error handler
        ├── config.ts             # lecture .env
        ├── prisma.ts             # singleton PrismaClient
        ├── types.ts              # augmentation Express.Request.user
        ├── middleware/
        │   ├── auth.ts           # requireAuth (Bearer JWT → req.user)
        │   ├── upload.ts         # multer (jpeg/png/webp/gif, 5 Mo, nom aléatoire)
        │   └── errorHandler.ts   # ApiError + MulterError + fallback 500
        ├── routes/
        │   ├── auth.ts           # register/login/google/me/config
        │   └── pois.ts           # CRUD POI + commentaires + photos
        └── utils/
            ├── jwt.ts            # signToken / verifyToken
            └── password.ts       # bcrypt hash / compare
```

### Modèle de données (Prisma — implémenté)
- **User** : `id` (cuid), `email` (unique), `passwordHash?`, `googleId?` (unique), `name`, `avatarUrl?`, `createdAt`
- **PoI** : `id`, `name`, `description?`, `lat`, `lng`, `category?`, `createdById → User`, `createdAt`, `updatedAt` ; index `[lat, lng]`
- **Comment** : `id`, `content`, `userId → User`, `poiId → PoI` (onDelete: Cascade), `createdAt`
- **Photo** : `id`, `url`, `userId → User`, `poiId → PoI` (onDelete: Cascade), `createdAt`

Relations : User `1-n` PoI/Comment/Photo ; PoI `1-n` Comment/Photo.

## Docker Compose (implémenté)

```yaml
services:
  db:      # postgres:16-alpine, port 5432, volume pgdata, healthcheck pg_isready
  server:  # Dockerfile server, env (DATABASE_URL→db:5432, JWT_SECRET, GOOGLE_*), volume uploads, port 3000
  client:  # Dockerfile client (nginx), port 8080:80, proxy /api + /uploads → server
volumes:
  pgdata:
  uploads:
```

| Command | Description |
|---|---|
| `docker compose up -d db` | PostgreSQL seul (recommandé pour le dev) |
| `npm run dev` | Dev local : server (tsx watch :3000) + client (Vite :5173, proxy) |
| `npm run db:migrate` / `db:seed` | Migration Prisma + seed de démo |
| `docker compose up --build` | Stack complète production-like : `http://localhost:8080` |

- Au démarrage en Docker, le server exécute `prisma migrate deploy` avant `node dist/index.js`.
- Le client est servi par nginx : `try_files` SPA + reverse proxy `/api/` et `/uploads/` vers `server:3000`.
- Config serveur injectée via variables d'environnement : `DATABASE_URL=postgresql://fihspot:fihspot@db:5432/fihspot`, `JWT_SECRET` (défaut Docker sinon), `GOOGLE_CLIENT_ID/SECRET`, `CLIENT_URL`.

## API (implémentée)
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
| GET | `/api/pois` | liste + `_count` comments/photos ; filtres bounds `?swLat&swLng&neLat&neLng` | – |
| GET | `/api/pois/:id` | détail complet (createdBy, comments, photos) | – |
| POST | `/api/pois` | créer (name, description?, category?, lat, lng validés) | ✅ |
| PATCH | `/api/pois/:id` | éditer name/description/category | ✅ auteur |
| DELETE | `/api/pois/:id` | supprimer | ✅ auteur |
| POST | `/api/pois/:id/comments` | ajouter un commentaire | ✅ |
| DELETE | `/api/pois/comments/:commentId` | supprimer | ✅ auteur |
| POST | `/api/pois/:id/photos` | upload multipart `photo` (image, ≤5 Mo) | ✅ |
| DELETE | `/api/pois/photos/:photoId` | supprimer | ✅ auteur |
| GET | `/uploads/:file` | photos servies statiquement | – |

## UX frontend — design & animations (implémenté)

### Direction artistique
- **Mobile-first**, carte plein écran comme point focal ; fond clair neutre (`#f8fafc`), accent **indigo** (`brand-600`), police **Inter**.
- **Tokens Tailwind** dans `tailwind.config.js` : palette `brand`, rayons (`rounded-2xl`/`3xl`), ombres `soft`/`float`, animations `fade-in`/`slide-up`.
- **Dark mode** préparé (stratégie `class`) : styles dark sur body, nav, drawer, inputs, cartes (filter invert sur Leaflet).
- Overlays glassmorphism (Navbar, bannière "chargement"), focus rings accessibles, micro-hovers.

### Animations (Framer Motion)
- **Transitions de page** : `AnimatePresence mode="wait"` + fade/slide entre routes.
- **Drawer/side-panel POI & AddPoiPanel** : spring — remonte depuis le bas en mobile (`y`), glisse depuis la droite en desktop (`x`, via `useMediaQuery`) ; backdrop fade.
- **FAB** : rotation `+` → `✕` (rotation 45°) et `active:scale-95`.
- **Formulaires** : shake horizontal des inputs en erreur, spinners (login/register, commentaire, upload).
- **Toasts** : slide-in/dismiss animés (success/error/info).
- **Marqueurs Leaflet** : `.marker-pin` (pins catégorisés), scale au survol, classe `.selected` (pulse/zoom).
- **Skeletons** : fiche POI en chargement (shimmer).

### Responsive & ergonomie tactile
- **Mobile** : FAB d'ajout (bas droite, 56 px), drawer plein largeur en bas d'écran (`h-[85dvh]`), boutons ≥ 44 px, boutons delete photo visibles sans hover, safe-area inset.
- **Desktop** : side-panel 420 px à droite, carte visible à côté.
- États **chargement / vide / erreur** : loader plein écran, skeletons, bannière "Chargement des points…", toasts d'erreur.
- Carte : bouton géolocalisation 🎯 (recenter), bannière "Cliquez sur la carte" en mode ajout.

## Statut & état
| Élément | État |
|---|---|
| Scaffold monorepo (workspaces, scripts, env, docker-compose, Dockerfiles) | ✅ implémenté |
| Schéma Prisma + migration `init` + seed (user démo + 5 POI) | ✅ implémenté |
| Auth email/mot de passe (JWT + bcrypt) + AuthContext + ProtectedRoute | ✅ implémenté |
| Google OAuth (endpoint serveur + GoogleButton client) | ✅ implémenté |
| Carte Leaflet (marqueurs, bounds, géoloc, mode ajout) | ✅ implémenté |
| Fiche POI (drawer animé, commentaires, photos, bouton Google Maps, suppression) | ✅ implémenté |
| Ajout de POI (placement clic + formulaire) | ✅ implémenté |
| Design responsive + animations (transitions, toasts, skeleton, dark mode) | ✅ implémenté |
| Stack Docker complète (`docker compose up --build` → :8080) | ✅ testé |
| Build client + serveur | ✅ OK |
| Compte de test | `demo@fihspot.app` / `demo1234` |

## À configurer / à faire (optionnel)
- **Google OAuth** : créer un projet Google Cloud, un OAuth Client ID, puis remplir `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (dans `server/.env` en dev, ou variables d'environnement Compose). Tant que vides, le bouton Google est masqué.
- **`JWT_SECRET`** : générer un secret fort et le définir (dev + Compose).
- **Tests d'API** : supertest (non ajouté à ce jour).
- **Dark mode toggle** : le CSS dark existe, mais le bouton de bascule persisté reste à brancher.
- **Recherche / filtres par catégorie** sur la carte : prévus en roadmap, non implémentés.
