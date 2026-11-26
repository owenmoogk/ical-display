# Shared Calendars (ical-display)

Several public Google Calendars in one color-coded view, saved under a short link like
**https://owenmoogk.com/ical-display/owenmoogk/family**.

Anyone can sign in with GitHub and create calendars. A calendar is private: only its
owner and the GitHub users it's shared with can see it. People it's shared with can add,
remove, rename and recolor its feeds; only the owner can rename it, change its link,
share it or delete it.

## How it works

```
browser ──▶ ical.owenmoogk.com (Cloudflare Tunnel → basement server)
              ├ calendars.json on the server: the only copy
              └ GitHub sign-in, sessions (tokens never reach the browser)
browser ──▶ Google Calendar API (events are fetched in the browser, as before)

server's data/ ──▶ NAS, nightly tar.gz (homelab repo's backup script)
```

- **Data** lives only on the server, in `~/ical-display/data/calendars.json`. Owners and
  shared users are stored by GitHub user id, so renaming a GitHub account doesn't lose
  access; links use the owner's current username.
- **Sharing** is by GitHub username. The server looks the username up on GitHub and stores
  the id, so the person doesn't need to have signed in before.
- **Edits** send the revision they were based on. If someone else saved in between, the
  server answers 409 and the page reloads their version.

## Layout

Yarn workspaces:

| Folder | What |
|---|---|
| `shared/` | `@ical/shared`: zod schema for `calendars.json`, API request/response types |
| `backend/` | Hono API, bundled by tsup into one file, `backend/dist/server.js` |
| `frontend/` | Vite + React 19 + Mantine 8, served by GitHub Pages |

## Development

```sh
yarn install
cp backend/.env.example backend/.env    # then fill in SESSION_KEY (command is in the file)
yarn dev                                 # backend :8789 + frontend http://localhost:3000/ical-display/
```

The example `.env` runs without a GitHub App: "Sign in" logs you in as a fake user
(`DEV_LOGIN`) and data is saved to `backend/.data/calendars.json`. To test sharing, sign
in as someone else in another browser profile with
`http://localhost:3000/auth/login?as=someone-else`, and share with `someone-else`.

```sh
yarn lint        # eslint + prettier, all workspaces
yarn typecheck
yarn build
```

## Releasing

```sh
yarn ver:patch   # or ver:minor / ver:major
```

This bumps the root version and pushes a `vX.Y.Z` tag. CI then:

1. lints, typechecks and builds;
2. creates a GitHub Release with `backend-dist` and `frontend-dist` zips;
3. deploys `frontend/dist` to GitHub Pages;
4. builds the backend Docker image (`Dockerfile`) and pushes it to
   `ghcr.io/owenmoogk/ical-display:vX.Y.Z` (and `:latest`);
5. SSHes to the server through the Cloudflare Tunnel and pipes `backend/deploy/compose.yaml`
   and a `secrets.env` built from this repo's secrets into `~/ical-display/deploy.sh`
   (`backend/deploy/deploy.sh`), which installs them, pulls the image, restarts the
   container, checks `/healthz`, and rolls back if the check fails.

## One-time setup

### 1. GitHub OAuth App
GitHub → Settings → Developer settings → OAuth Apps → New:
- **Homepage URL:** `https://owenmoogk.com/ical-display/`
- **Authorization callback URL:** `https://ical.owenmoogk.com/auth/callback`

It asks for no scopes, so it only sees public profile info. Put its **Client ID** in
`GITHUB_APP_CLIENT_ID` in `backend/deploy/compose.yaml`, and a client secret in the
`APP_CLIENT_SECRET` repo secret.

### 2. Server (same box and pattern as the-compiler)
```
~/ical-display/
  compose.yaml   installed by each deploy (from backend/deploy/compose.yaml)
  .env           TAG=vX.Y.Z, APP_UID=, APP_GID= (the user that owns data/)
  secrets.env    installed by each deploy from GitHub secrets (chmod 600)
  deploy.sh      copy of backend/deploy/deploy.sh (the deploy key's forced command)
  data/          calendars.json (the only copy), sessions.enc
```
```sh
mkdir -p ~/ical-display/data && cd ~/ical-display
cp <repo>/backend/deploy/deploy.sh . && chmod +x deploy.sh
printf 'TAG=\nAPP_UID=%s\nAPP_GID=%s\n' "$(id -u)" "$(id -g)" > .env
```
The container shares the host network and listens on `127.0.0.1:8789` (the-compiler uses
8788). Add `~/ical-display/data` to the NAS backup script.

Add a **new** deploy key to `~/.ssh/authorized_keys` (a forced command is per key):
```
command="/home/USER/ical-display/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... ical-display-deploy
```

### 3. Cloudflare
In the existing tunnel, add a public hostname `ical.owenmoogk.com` → `http://localhost:8789`.

### 4. This repo's settings
- **Pages:** Source = *GitHub Actions*.
- **Secrets:** `DEPLOY_SSH_KEY` (the new key's private half), `DEPLOY_KNOWN_HOSTS`,
  `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `SESSION_KEY` (32 random bytes,
  base64) and `APP_CLIENT_SECRET` (the GitHub App's client secret).
- **Variables:** `DEPLOY_HOST`, `DEPLOY_USER`
