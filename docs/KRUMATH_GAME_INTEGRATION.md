# Integrate a Separate Game Repo with krumath.com

Use this document when shipping a **new game in its own repository** and mounting it under **krumath.com** (same pattern as Quick Brain Racer).

Copy this file into the new game repo (or paste it into an AI session) so tools know the full process.

---

## Goal

| Piece | Responsibility |
| --- | --- |
| **Game repo** | Game code, Cloudflare Worker deploy, auth gate |
| **Cloudflare** | Route `krumath.com/<game-path>*` to the game Worker |
| **KruMath monorepo** (`D:\Coding Project\KruMath`) | Home page Play button only; auth/sign-in already exists |

Do **not** merge the game into the KruMath monorepo unless explicitly asked.

Do **not** put the game on `learn.krumath.com` unless the product owner asks for that.

---

## Architecture (mental model)

```
User → krumath.com/home  (KruMath Worker: Next.js / OpenNext)
         │
         │ clicks Play
         ▼
       krumath.com/<game-slug>   ← Cloudflare route → Game Worker (this repo)
         │
         ├─ has real Supabase session cookie? → play
         └─ no / anonymous? → redirect to /sign-in?returnUrl=/<game-slug>
                                  │
                                  └─ after sign-in → back to /<game-slug>
```

- **Main site Worker** name: `krumath` (apps/web).
- **Learn platform** is a different Worker (`krumath-learn` on learn.krumath.com). Ignore it for this flow.
- **Auth source of truth**: Supabase Auth (`@supabase/ssr` cookies), domain `.krumath.com`.
- **Firebase**: only used by KruMath for **phone SMS OTP**. Games must **not** use Firebase for session.

Replace `<game-slug>` everywhere (example: `quick-brain-racer`).

---

## Auth rules (must match KruMath)

### Session

- Same Supabase project as KruMath.
- Browser + server clients via `@supabase/ssr`.
- Cookie options when hostname ends with `krumath.com`:

```ts
{ domain: ".krumath.com", path: "/", sameSite: "lax", secure: true }
```

- On `localhost`, leave `domain` unset (cookies do **not** share across different ports).

### Who can play

Treat as **not logged in** if:

- no user, **or**
- `user.is_anonymous === true`

(Same idea as KruMath `RequireLoggedIn`.)

### Redirect when blocked

Send the browser to:

```text
/sign-in?returnUrl=/<game-slug>
```

- Prefer a **relative** URL on production (`krumath.com`) so it stays same-origin.
- KruMath already validates `returnUrl` and sends the user back after sign-in. **Do not rebuild sign-in** in the game.
- Optional local override: `VITE_KRUMATH_ORIGIN=http://localhost:3000` so redirects hit the local KruMath web app.

### Env names

| Game repo (Vite) | KruMath (Next) |
| --- | --- |
| `VITE_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `VITE_KRUMATH_ORIGIN` (optional) | — |

**Vite embeds `VITE_*` at build time.** Changing keys requires rebuild + redeploy.

---

## End-to-end process

### Phase A — Game repository (AI / developer)

1. **Keep the game in its own repo.**
2. **Choose a URL path** on the main site: `/<game-slug>` (kebab-case, unique).
3. **Serve the app under that path:**
   - Vite: `base: "/<game-slug>/"`
   - If using Nitro: `baseURL: "/<game-slug>/"` so assets land at `/<game-slug>/assets/...`
   - Router file routes must be **in-app paths only** (`/` and `/live`), **not** `/<game-slug>/...`. Vite `base` already mounts the app. Using both produces `/<game-slug>/<game-slug>`.
4. **Add Supabase auth gate** on all game routes (prefer `createIsomorphicFn` so `.server.ts` / `.client.ts` are not imported in the same module):
   - `getUser()` via SSR cookies
   - reject missing / anonymous
   - redirect to `/sign-in?returnUrl=/<game-slug>`
5. **Point “Go home”** at `https://krumath.com/home` (or `/home` on same origin).
6. **Deploy target**: Cloudflare Worker (Nitro `cloudflare-module` or equivalent). Match KruMath’s Cloudflare setup, not Firebase Hosting / Cloud Run.
7. Document `.env.example` with the `VITE_SUPABASE_*` vars. Never commit secrets.

Reference implementation in this repo:

- `src/lib/krumathCookies.ts` — cookie domain helpers
- `src/lib/krumathUrls.ts` — home + sign-in URLs
- `src/lib/supabase.client.ts` / `supabase.server.ts` — clients
- `src/lib/requirePlayableUser.ts` + `src/routes/index.tsx` / `src/routes/live.tsx` — gate

### Phase B — Cloudflare (operator)

1. Build with Supabase env present: `npm run build` (or `npm run deploy`).
2. Deploy the game Worker (e.g. name `quick-brain-racer` or similar).
3. Add a **hostname route** more specific than the main site Worker:

   ```text
   krumath.com/<game-slug>*  →  <game-worker>
   ```

4. Leave the **`krumath`** Worker for `/`, `/home`, `/sign-in`, `/auth/*`, etc.
5. Smoke-test:
   - Signed-out → `/sign-in?returnUrl=...`
   - Sign-in → returns to game
   - Assets load from `/<game-slug>/assets/...` (not `/assets/...` on the main site)

### Phase C — KruMath monorepo (operator / separate PR)

Do this **last**, after the game URL works.

1. **No auth changes** for a normal `/sign-in?returnUrl=/<game-slug>` flow (already supported).
2. Add a Play entry on **`/home#game-section`** (see `apps/web/src/components/dashboard/GameSection.tsx`) linking to `/<game-slug>`.
3. Only touch `apps/web/src/middleware.ts` if the path still hits the Next Worker. If Cloudflare routes the path to the game Worker, the **game** owns auth.

Monorepo path: `D:\Coding Project\KruMath` (not the legacy Firebase SPA under Documents/GitHub).

---

## Order of work (do not reverse)

1. Game repo ready (path + auth + Cloudflare build)
2. Deploy Worker + Cloudflare route
3. Verify URL + login loop on krumath.com
4. Add Play button on `/home`

Adding the home button first creates a dead or unlocked link.

---

## Checklist for a new game

```text
[ ] Game lives in a separate git repo
[ ] Path chosen: /<game-slug>
[ ] Vite/Nitro base = /<game-slug>/
[ ] Same Supabase project as KruMath (VITE_* = NEXT_PUBLIC_* values)
[ ] Cookie domain .krumath.com on production hosts
[ ] Block anonymous + unsigned → /sign-in?returnUrl=/<game-slug>
[ ] Cloudflare Worker deployed
[ ] Route krumath.com/<game-slug>* → game Worker (before main Worker)
[ ] Smoke-tested signed-out and signed-in
[ ] Play link added on krumath.com/home#game-section
```

---

## Common mistakes

| Mistake | Result |
| --- | --- |
| Assets at `/assets/...` without path base | Main KruMath Worker serves wrong/missing files |
| Router `basepath` **or** file routes under `/<slug>` **plus** Vite `base` `/<slug>/` | Double path (`/<slug>/<slug>`) |
| Firebase Auth for the game session | Breaks SSO with KruMath |
| Allowing anonymous Supabase users | Guests can play without real accounts |
| Open redirects after sign-in | Only allow KruMath origins / relative paths (KruMath already does this for `returnUrl`) |
| Expecting localhost:3000 cookies on localhost:5173 | Different origins; test auth on production path or one shared host |
| Putting game under learn.krumath.com by default | Wrong product surface unless requested |

---

## What AI tools should / should not edit

**Usually edit (game repo):**

- Game source, Vite/Nitro config, auth gate, `.env.example`, deploy scripts

**Usually do not edit unless asked:**

- `D:\Coding Project\KruMath` (Play button is a separate, last step)
- learn.krumath.com / `apps/learn`
- Firebase phone OTP flows
- Rewriting git history

When asked only to “integrate with krumath.com”, implement Phases A–C as above and leave a short operator checklist for Cloudflare + the home Play link.
