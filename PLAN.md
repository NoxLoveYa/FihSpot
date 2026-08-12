# PLAN — FihSpot

## Objectif
Site web responsive mobile où les utilisateurs authentifiés ajoutent et consultent des **points d'intérêt** sur une carte. Un POI "focusé" affiche une fiche avec **commentaires**, **photos** et un bouton **"Ouvrir dans Google Maps"**.

## Stack
- **Frontend** : React 18 + TypeScript + Vite, React Router, Leaflet (`react-leaflet`), Tailwind CSS, Framer Motion
- **Backend** : Express + TypeScript, Prisma ORM, JWT
- **Auth** : email/mot-de-passe (bcrypt) + Google OAuth (flux serveur)
- **Photos** : upload local via `multer`, servi statiquement par Express
- **Base de données** : PostgreSQL 16 (via Docker Compose)
- **Monorepo simple** : `client/` + `server/` + root `package.json`

## Structure du monorepo
```
FihSpot/
├── PLAN.md
├── package.json                 # scripts racine (dev, build, db:*)
├── .env.example                 # PORT, JWT_SECRET, DATABASE_URL, GOOGLE_*
├── docker-compose.yml           # PostgreSQL + optionnel services app
├── client/
│   ├── vite.config.ts           # proxy /api -> server
│   └── src/
│       ├── main.tsx / App.tsx / router.tsx
│       ├── components/          # Navbar, Map, MarkerPopup, PoIDetail, CommentList, PhotoGrid
│       ├── pages/               # MapPage, LoginPage, RegisterPage, AddPoIPage, ProfilePage
│       ├── api/                 # client axios + types
│       ├── context/             # AuthContext
│       └── styles/              # tokens Tailwind (couleurs, typo, radii)
└── server/
    ├── src/
    │   ├── index.ts / app.ts    # bootstrap + middlewares/routes
    │   ├── prisma.ts            # client singleton
    │   ├── middleware/          # authJWT, upload, errorHandler
    │   ├── routes/              # auth, pois, comments, photos, users
    │   ├── controllers/         # logique métier
    │   └── utils/               # jwt, oauth, password
    ├── prisma/schema.prisma + seed.ts
    ├── Dockerfile               # build multi-stage Node
    └── uploads/                 # photos (volume Docker, gitignored)
```

## Modèle de données (Prisma)
- **User** : id, email (unique), passwordHash?, googleId?, name, avatarUrl?, createdAt
- **PoI** : id, name, description?, lat, lng, category?, createdById → User, createdAt, updatedAt
- **Comment** : id, content, userId → User, poiId → PoI, createdAt
- **Photo** : id, url, poiId → PoI, userId → User, createdAt

Relations : User `1-n` PoI/Comment/Photo ; PoI `1-n` Comment/Photo.

## Docker Compose

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: fihspot-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: fihspot
      POSTGRES_PASSWORD: fihspot
      POSTGRES_DB: fihspot
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fihspot"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### Usages prévus
| Command | Description |
|---|---|
| `docker compose up -d db` | Démarre PostgreSQL (défaut pour le dev local) |
| `docker compose up --build` | Démarre la stack complète (db + server + client en production-like) |

- **Dev** : on lance seulement `db` ; `npm run dev` fait tourner client (Vite :5173) et server (Express :3000) en local avec hot reload. `DATABASE_URL=postgresql://fihspot:fihspot@localhost:5432/fihspot`.
- **Prod/stack complète** : `Dockerfile` multi-stage du server (build TS → `node dist/index.js`), `Dockerfile` multi-stage du client (build Vite → `nginx` servant `dist/`, reverse proxy `/api` → server). Volumes : `pgdata` (BDD) + `uploads` (photos).
- **Migrate/seed** : `npm run db:migrate` et `npm run db:seed`.
- **`.env` côté Docker** : `DATABASE_URL` pointe sur `db:5432` quand le server tourne en container ; `JWT_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `CLIENT_URL` injectés via `environment`/`env_file`.

## API
### Auth
- `POST /api/auth/register` — email + mot de passe (bcrypt)
- `POST /api/auth/login` — JWT (localStorage)
- `POST /api/auth/google` — échange token Google → JWT
- `GET /api/auth/me` — profil (protégé)

### Points d'intérêt
- `GET /api/pois` — liste (bounds lat/lng/radius optionnelles)
- `GET /api/pois/:id` — détail + commentaires + photos
- `POST /api/pois` — créer (protégé)
- `PATCH /api/pois/:id` — éditer (auteur)
- `DELETE /api/pois/:id` — auteur

### Commentaires / Photos
- `POST /api/pois/:id/comments` (protégé) / `DELETE /api/comments/:id`
- `POST /api/pois/:id/photos` — multipart multer, filtre image, limite taille
- `DELETE /api/photos/:id` — auteur
- `GET /uploads/:file` — statique

## UX frontend — design & animations

### Direction artistique
- **Mobile-first**, ambiance "exploration" : fond clair neutre (gris très clair / blanc cassé), accent coloré vif (ex. indigo ou émeraude), carte qui reste le point focal plein écran.
- **Tokens Tailwind** centralisés dans `theme` : palette, typographie (police UI système ou variable comme Inter/Geist), rayons (cards `rounded-2xl`), ombres douces, espaces.
- **Dark mode** optionnel via `class` strategy + toggle persisté (low effort, belle plus-value).
- Micro-détails : surfaces glassmorphism légères sur les overlays de carte, hover states subtils (scale + shadow), focus rings accessibles.

### Animations (Framer Motion)
- **Transitions de page** : fade + slide léger entre routes (AnimatePresence) — navigation fluide, jamais abrupte.
- **Drawer/side-panel POI** : spring `y`/`x` — glisse et remonte depuis le bas sur mobile, depuis le côté sur desktop ; backdrop avec fade.
- **Marqueurs Leaflet** : apparition en pop (scale) des nouveaux POI ; marqueur sélectionné animé (bounce/pulse) + popup avec transition d'entrée.
- **Listes (commentaires, photos)** : entrée en stagger — les items apparaissent en cascade discrète.
- **Boutons & FAB** : micro-interactions (scale au tap/hover), feedback de clic tactile (mobile).
- **Formulaires** : shake/erreur animée sur champs invalides, spinner de chargement (login/upload).
- **Toasts** : slide-in depuis le haut ou le bas, auto-dismiss animé.
- **Respect `prefers-reduced-motion`** : on désactive les animations fortes pour accessibilité.

### Responsive & ergonomie tactile
- **Mobile** : FAB "ajouter" au pouce (en bas à droite), navbar bottom, drawer POI plein largeur qui remonte, zones tactiles ≥ 44px.
- **Desktop** : FAB flottant + barre de recherche/catégories, side-panel resserré avec carte à côté.
- États **vide / chargement / erreur** partout (skeleton shimmer sur la fiche POI), photos en lazy-load.
- Carte : boutons zoom natifs Leaflet repositionnés, bouton "récentrer sur ma position" (geolocation).

## Étapes d'implémentation
1. **Scaffold** : monorepo, Vite React TS, Express TS, root scripts, `.env.example`, `docker-compose.yml` + `Dockerfile`s, Tailwind + Framer Motion + tokens.
2. **Base de données** : `docker compose up -d db`, migration Prisma (User/PoI/Comment/Photo) + seed.
3. **Auth** : register/login JWT + AuthContext + protection de routes.
4. **Google OAuth** : flux serveur + bouton client.
5. **Map** : Leaflet, marqueurs animés, chargement POI, géolocalisation.
6. **Fiche POI focus** : drawer animé, commentaires, upload photos, bouton Google Maps.
7. **Ajout d'un POI** : flow placement + formulaire animé.
8. **Responsive polish + animations** : transitions de page, toasts, skeleton, dark mode, reduced-motion.
9. **Dockerisation complète** : images server + client, `docker compose up --build`, volumes.
10. **Build & vérifs** : `npm run build` des deux côtés, tests d'API (supertest optionnel).
