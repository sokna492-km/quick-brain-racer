# Prompt for KruMath monorepo AI (copy into that chat)

Paste everything below the line into an AI session that has access to **`D:\Coding Project\KruMath`** (the Cloudflare + Supabase monorepo). Do **not** use the old Firebase SPA under Documents/GitHub.

---

## Task

Integrate the standalone game **Quick Brain Racer** into **krumath.com** so users can open it from the home page, play only when signed in (non-anonymous), and return after sign-in.

The **game source already lives in a separate repo** (`quick-brain-racer`). Do **not** merge that game into this monorepo. Do **not** put it on `learn.krumath.com`.

Your job in **this** repo (`KruMath`) is only the main-site pieces: routing awareness if needed, and a **Play entry on `/home`**. Cloudflare Worker routing for the game path may be done by the human in the Cloudflare dashboard; document exactly what they must configure if you cannot do it from code.

## Product intention

1. User is on **https://krumath.com/home**.
2. They click a Play card/button (prefer the existing **Games** section: `/home#game-section`, see `apps/web/src/components/dashboard/GameSection.tsx`).
3. They go to **https://krumath.com/quick-brain-racer**.
4. That path is served by a **separate Cloudflare Worker** (the game app), not by the main `krumath` OpenNext Worker.
5. The game checks **Supabase Auth** (same project as KruMath, cookies on `.krumath.com`).
6. If the user is missing or **anonymous** → redirect to  
   **`/sign-in?returnUrl=/quick-brain-racer`**  
   (relative URL). KruMath already supports `returnUrl`; after sign-in they come back to the game.
7. If they are a real signed-in user → they play.

Auth stack reminder (do not reinvent):

- Source of truth: **Supabase Auth** (`@supabase/ssr`).
- **Firebase is only for phone SMS OTP** in KruMath. The game does not use Firebase for session.
- Anonymous users must **not** be treated as logged in (same as `RequireLoggedIn`).

## What the game repo already does (do not re-implement in KruMath)

The game repo already:

- Mounts under Vite/Nitro base `/quick-brain-racer/`
- In-app routes `/` and `/live` → public URLs `/quick-brain-racer/` and `/quick-brain-racer/live`
- Gates play with Supabase cookies; skips the gate only in local `npm run dev`
- Redirects unsigned users to `/sign-in?returnUrl=/quick-brain-racer`
- Documents the full pattern in `docs/KRUMATH_GAME_INTEGRATION.md` (in the game repo)

## What you should do in KruMath

### 1. Home Play button (required)

Add a clear Play card/link in **`GameSection`** (or equivalent on `/home#game-section`) that navigates to:

```text
/quick-brain-racer
```

Match existing GameSection styling (same pattern as Math Snake linking out). Prefer same-origin path `/quick-brain-racer`, not `learn.krumath.com`.

Do this **last** only if the human confirms the Cloudflare route already works; otherwise still implement the UI but note that the link will 404 until the route exists.

### 2. Auth / sign-in (usually no code)

Confirm that `/sign-in?returnUrl=/quick-brain-racer` already works via existing `returnUrl` helpers (`apps/web/src/utils/auth/returnUrl.ts`). Relative paths like `/quick-brain-racer` should already be allowed.

Do **not** build a new login modal or Firebase session for this game.

### 3. Middleware (only if needed)

`apps/web/src/middleware.ts` currently protects `/dashboard` and `/settings`.  
If Cloudflare correctly sends `krumath.com/quick-brain-racer*` to the **game Worker**, the main Next middleware **never sees** that path — do **not** add game auth there.

Only add middleware for `/quick-brain-racer` if that path still hits the Next Worker (misconfigured route). Prefer fixing Cloudflare routing instead.

### 4. Cloudflare (document for the human)

Tell the human to:

1. Deploy the game Worker from the `quick-brain-racer` repo.
2. Add a hostname route **more specific** than the main site Worker:

   ```text
   krumath.com/quick-brain-racer*  →  <quick-brain-racer-worker>
   ```

3. Keep the main **`krumath`** Worker for `/`, `/home`, `/sign-in`, `/auth/*`, etc.

Without that route, Next will 404 `/quick-brain-racer`.

## Out of scope

- Editing or vendoring the game’s TanStack/Vite source into this monorepo
- `learn.krumath.com` / `apps/learn`
- Changing phone/Firebase OTP
- Rewriting Supabase cookie domain logic unless broken for this flow

## Success criteria

- [ ] `/home#game-section` has a Play entry for Math Racer / Quick Brain Racer → `/quick-brain-racer`
- [ ] Signed-out (or anonymous) users hitting the game end up at `/sign-in?returnUrl=/quick-brain-racer` and return after login (game Worker owns the gate)
- [ ] Human has a clear Cloudflare route checklist
- [ ] No regression to existing Snake / learn platform links

## Suggested first step

Read `GameSection.tsx`, `returnUrl.ts`, and `apps/web/wrangler.toml`. Propose a minimal diff for the Play card only, then implement it. Call out Cloudflare route as a separate operator step if it cannot be done from this repo.
