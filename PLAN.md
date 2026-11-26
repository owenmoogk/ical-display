# Plan: saved, shareable calendars with a backend

Goal: replace the `#/?cals=<base64>` URL state with calendars saved on a server, at
`owenmoogk.com/ical-display/<owner>/<calName>`, editable by their owner and by GitHub
users the owner shares them with. Deployed the same way as the-compiler.

Decisions so far:

- **Viewing is private.** Only the owner and people it's shared with can view or edit.
- **URLs are per-user:** `/ical-display/<githubLogin>/<slug>`, e.g. `/ical-display/owenmoogk/family`.
- **Clean paths** (BrowserRouter + GitHub Pages 404 redirect), not `#/`.
- **Old `?cals=` links are dropped.** They show a short "no longer supported" message.

## 1. Repo layout (same as the-compiler)

Convert to Yarn workspaces:

| Folder | What |
|---|---|
| `shared/` | `@ical/shared`: zod schemas for `calendars.json` and request bodies, slug rules |
| `backend/` | Hono API, bundled by tsup into `backend/dist/server.js` |
| `frontend/` | Today's `src/`, `index.html`, `vite.config.ts`, etc. moved here, served by GitHub Pages |

Root `package.json` gets the compiler's `dev` / `build` / `lint` / `typecheck` / `ver:*`
scripts. `yarn dev` runs the backend on :8789 and Vite on :3000, with `/auth` and `/api`
proxied to the backend so dev is one origin.

## 2. Backend

### Copied from the-compiler, nearly as-is
- `config.ts` (zod env schema, `DEV_LOGIN` for local use without a GitHub App). Drop
  `EDITOR_GITHUB_ID`, since anyone can sign in.
- `auth/github.ts`, `auth/sessions.ts` (AES-GCM encrypted `sessions.enc`, tokens never
  reach the browser), `auth/routes.ts` (`/auth/login`, `/auth/callback`, `/auth/me`,
  `/auth/logout`), `auth/middleware.ts` (`optional` / `required`). The global `editor`
  middleware and `canEdit` are replaced by per-calendar checks.
- `http.ts` (error handler, zod validators), the CORS + CSRF setup in `app.ts`, `/healthz`.
- The store/mutator pattern from `bookmarks/store.ts`: one JSON file, writes serialized
  in-process, written to `.tmp` then renamed.

### Data: `data/calendars.json`

```jsonc
{
  "version": 1,
  "users": { "58040528": "owenmoogk" },          // githubId -> current login, updated at each sign-in
  "calendars": [
    {
      "id": "k3J9x0aB2c",                       // nanoid, stable
      "ownerId": 58040528,                      // numeric id, so a GitHub rename doesn't lose ownership
      "slug": "family",                         // a-z 0-9 -, unique per owner
      "title": "Family",
      "sources": [{ "id": "…", "name": "Owen (School)", "url": "https://…", "color": "#…" }],
      "sharedWith": [58040529],                 // GitHub ids
      "revision": 7,                            // bumped on every save, for conflict checks
      "createdAt": "…", "updatedAt": "…"
    }
  ]
}
```

Links use the owner's *current* login (looked up through `users`), so if someone renames
their GitHub account, their links change with it but nothing is lost.

### Permissions
- **Owner:** view, edit sources, rename / change slug, delete, manage sharing.
- **Shared user:** view and edit sources (add, remove, rename, recolor). Can't share
  further, rename or delete. *(Default I picked; say if collaborators should be able to share too.)*
- **Anyone else / signed out:** 401 or 404. A calendar you can't see returns 404 so
  names aren't leaked.

### Sharing by GitHub username
The owner types `ArmaanSengupta`. The backend resolves it with
`GET api.github.com/users/ArmaanSengupta` (using the owner's token) to get the numeric id,
stores the id, and records the login in `users`. When Armaan signs in with GitHub, any
calendar whose `sharedWith` holds his id appears in his list. He doesn't need to have
signed in before being shared with.

### API (all `credentials: include`, typed client via `hc<AppType>` like the-compiler)

| Method + path | Who | What |
|---|---|---|
| `GET /api/calendars` | signed in | Mine and shared with me (title, owner, slug) |
| `POST /api/calendars` | signed in | Create `{ slug, title }` |
| `GET /api/calendars/:owner/:slug` | owner or shared | The full calendar |
| `PUT /api/calendars/:owner/:slug/sources` | owner or shared | Replace sources `{ sources, revision }`; 409 if `revision` is stale |
| `PATCH /api/calendars/:owner/:slug` | owner | `{ title?, slug? }` |
| `DELETE /api/calendars/:owner/:slug` | owner | Delete |
| `PUT /api/calendars/:owner/:slug/shares` | owner | `{ logins: [...] }`, resolved to ids; unknown login is a 400 |

Saving the whole sources list with a `revision` keeps the API small. If two people edit
at once, the second save gets a 409, and the frontend reloads and says "someone else
changed this calendar".

Limits, since anyone can sign in: 25 calendars per user, 50 sources per calendar,
25 shares, URLs ≤ 2 KB, request body ≤ 64 KB.

## 3. Frontend

- **Routing:** `HashRouter` → `BrowserRouter basename="/ical-display"`. Set
  `pathSegmentsToKeep = 1` in `public/404.html` and add the matching decode snippet to
  `index.html` (the standard spa-github-pages pair), so a direct hit on
  `/ical-display/owenmoogk/family` loads the app.
- **Routes:**
  - `/` — signed out: what this is + "Sign in with GitHub". Signed in: my calendars,
    shared with me, "New calendar" (title → suggested slug).
  - `/:owner/:slug` — today's `CalendarApp`, loading sources from the API instead of the
    URL. `?embed=1` still hides the chrome.
  - Old `?cals=` links → short notice that this link format is gone.
- **Editing:** the sidebar's add / remove / rename / recolor call
  `PUT …/sources` (color and name edits debounced). Visibility toggles stay local and are
  not saved, as now.
- **Sharing:** owner sees a "Share" panel: list of GitHub usernames with avatars, add by
  username, remove. Plus the copyable link.
- **Header:** avatar + sign out, like the-compiler's `Nav` / `session.tsx`.
- `src/calendar/urlState.ts` is deleted. Event fetching (Google Calendar API in the
  browser) doesn't change.

**Embeds:** because viewing needs sign-in, `embed=1` iframes only work for signed-in
viewers on pages under `owenmoogk.com` (the session cookie is same-site there). An iframe
on another site won't get the cookie and will show "sign in".

## 4. Docker and deploy (copied from the-compiler)

- `Dockerfile`: same two-stage build, `node:22-alpine`, runs `dist/server.js` as `node`.
- `backend/deploy/compose.yaml`: project name `ical-display`, image
  `ghcr.io/owenmoogk/ical-display:${TAG}`, host network on `127.0.0.1:8789` (8788 is the
  compiler), `./data:/data`, read-only root, `cap_drop: ALL`, healthcheck,
  `PUBLIC_URL=https://ical.owenmoogk.com`, `FRONTEND_URL=https://owenmoogk.com/ical-display/`.
- `backend/deploy/deploy.sh`: same script, `PORT=8789`, `IMAGE=ghcr.io/owenmoogk/ical-display`.
- `.github/workflows/ci.yml`: replaces `deploy.yml`. Adds the `image` and
  `deploy-backend` jobs; a `v*` tag deploys Pages and the backend.

One-time setup (written up in the README as in the-compiler):
1. **New GitHub App** (sign-in only, no permissions), callback
   `https://ical.owenmoogk.com/auth/callback`, expiring tokens on, webhook off.
   **"Where can it be installed" must be "Any account"** so people other than you can sign
   in; with no permissions it can't access anything.
2. **Server:** `~/ical-display/{data,.env,deploy.sh}`, a new deploy key with
   `command="…/ical-display/deploy.sh"`.
3. **Cloudflare tunnel:** `ical.owenmoogk.com` → `http://localhost:8789`.
4. **Repo secrets / vars:** `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `CF_ACCESS_CLIENT_ID`,
   `CF_ACCESS_CLIENT_SECRET`, `SESSION_KEY`, `APP_CLIENT_SECRET`; vars `DEPLOY_HOST`,
   `DEPLOY_USER`. Add `data/` to the NAS backup script.

## 5. Order of work

1. Workspace restructure (move frontend, add root scripts, eslint config). Build still passes.
2. `shared/` schemas.
3. Backend: auth copied over, calendar store and routes, `DEV_LOGIN` works locally.
4. Frontend: router switch, API client, session provider, home page, calendar page
   wired to the API, share panel; remove URL state.
5. Dockerfile, compose, deploy.sh, CI, README.
6. Check: `yarn lint`, `yarn typecheck`, `docker build`, and a local run with two
   `DEV_LOGIN` users sharing a calendar.

## Open points (defaults chosen, change if you want)
- Backend hostname `ical.owenmoogk.com`, port 8789.
- Shared users can edit sources but can't reshare, rename or delete.
- `DEV_LOGIN` will take a `?as=<login>` so two fake users can be tested locally.
