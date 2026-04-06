# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## AIST Brand System (updated April 2026)

All green (#4CAF50) branding replaced with AIST electric blue (#1762FF) from the stork logo.

**Theme tokens** (`artifacts/aist-app/constants/colors.ts`):
- `Colors.primary` = `#1762FF` (electric blue — CTA, tabs, active states)
- `Colors.primaryLight` = `#4D8DFF` (hover/gradient)
- `Colors.primaryDark` = `#0B47CC` (pressed)
- `Colors.primaryBg` = `#EBF0FF` (light mode tint areas)
- `Colors.primaryMid` = `#D6E4FF` (light cards)
- `Colors.dark.*` = navy palette for dark backgrounds
- Legacy `Colors.green*` aliases → all map to new blue tokens (backward-compat)

**Admin theme** (`artifacts/admin/src/index.css`): Tailwind v4 CSS variables — `--primary: 219 100% 55%` (electric blue) in both light and dark mode.

**Logo**: AIST stork logo image at `artifacts/aist-app/assets/images/aist-logo.png` (mobile) and `artifacts/admin/public/aist-logo.png` (web). Brand icon SVG in `AistLogo.tsx` (PinIcon + AistBirdIcon with blue gradients).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   ├── aist-app/           # Expo mobile app (iOS/Android)
│   └── admin/              # React/Vite admin panel (at /admin/)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

---

## AIST Delivery App (`artifacts/aist-app`)

Expo React Native mobile app for iOS/Android. Built with Expo Router, TypeScript, CZK currency, 4-language i18n.

### Auth Architecture

**Email Auth** (fully implemented):
- `POST /api/auth/register` — creates user, returns JWT pair
- `POST /api/auth/login` — validates credentials, returns JWT pair
- `POST /api/auth/refresh` — refreshes expired access token
- `GET /api/auth/me` — validates access token, returns user profile

**JWT**: access token (1h) + refresh token (30d). Both signed with `JWT_SECRET` env var (falls back to dev default if not set).

**Session persistence**: tokens stored in AsyncStorage. On app launch, `restoreSession()` in `authService.ts` validates access token → falls back to refresh → clears if both fail.

**Auth guard**: `app/index.tsx` (splash screen) — waits for both splash animation AND auth restore to complete, then routes to `/(tabs)` (authenticated), `/auth` (onboarded but logged out), or `/welcome` (first launch).

**Firebase scaffolds** (ready to wire up):
- `services/firebase/phoneAuth.ts` — phone SMS auth stubs + integration guide
- `services/firebase/googleAuth.ts` — Google Sign-In stubs + integration guide
- `artifacts/api-server/src/routes/auth.ts` has a commented `POST /api/auth/firebase` endpoint

**Role-based routing** (scaffolded):
- `UserRole = "customer" | "courier" | "admin"` in `lib/db/src/schema/users.ts`
- `useAuth()` exposes `isCustomer` and `isCourier` booleans
- New users default to `"customer"` role
- `firebaseUid` column in `users` table reserved for Firebase Phone/Google users

### Key Files

| File | Purpose |
|------|---------|
| `artifacts/aist-app/services/authService.ts` | All auth API calls, token persistence, Firebase stubs |
| `artifacts/aist-app/services/firebase/phoneAuth.ts` | Firebase Phone Auth scaffold |
| `artifacts/aist-app/services/firebase/googleAuth.ts` | Firebase Google Sign-In scaffold |
| `artifacts/aist-app/context/AuthContext.tsx` | Auth state, session restore, signOut, role helpers |
| `artifacts/aist-app/app/index.tsx` | Splash + auth guard routing |
| `artifacts/aist-app/app/login-email.tsx` | Real email register/login with error handling |
| `artifacts/aist-app/app/(tabs)/profile.tsx` | Logout with Alert confirm, real user name display |
| `artifacts/aist-app/metro.config.js` | Dev proxy: `/api-server/*` → `localhost:8080` |
| `artifacts/api-server/src/routes/auth.ts` | Auth routes (register/login/refresh/me) |
| `artifacts/api-server/src/middlewares/auth.ts` | JWT requireAuth middleware |
| `lib/db/src/schema/users.ts` | Users table with role + firebaseUid columns |

### API URL (dev)

The Metro dev server proxies `/api-server/*` to the Express API on port 8080.
`authService.ts` constructs: `https://${EXPO_PUBLIC_DOMAIN}/api-server` as `API_BASE_URL`.

For production: set `EXPO_PUBLIC_API_URL` to the deployed API server URL.

## Beta QA Status (2026-04-03)

Full API QA pass completed. 26 scenarios tested. Status: ✅ **CLOSED BETA READY**.

### API Response Format Notes (important for integrations)

- Auth login (`POST /api/auth/login`) returns `accessToken` (not `token`)
- Pricing (`POST /api/pricing/calculate`) returns `{ breakdown: { total, subtotal, ... } }`
- Admin endpoints return wrapped objects: `{ orders: [...] }`, `{ users: [...] }`, `{ coupons: [...] }` etc.
- Health: `GET /api/healthz` (not `/api/health`)
- serviceType for pricing must be lowercase: `flash`, `cargo`, `bfm`

### Bugs Fixed in QA Pass

1. Finance health 500 → fixed `db.execute()` destructuring + wrong SQL column names in `system.ts`
2. App.json splash color → updated to `#1762FF`
3. App.json missing location permissions → added `expo-location` plugin + iOS infoPlist + Android permissions

### Integration Credentials

All mock-mode until set:
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — real payment processing
- `SENDGRID_API_KEY`, `AIST_FROM_EMAIL` — email delivery  
- `STORAGE_BUCKET_URL` — cloud PDF storage

See `BETA_QA.md` at project root for full TestFlight / App Store checklist.
