# Quick Brain Racer (KruMath)

Arcade math racer for krumath.com. Source stays in this repo; the main KruMath site only links here.

**For future games / AI tools:** copy [docs/KRUMATH_GAME_INTEGRATION.md](docs/KRUMATH_GAME_INTEGRATION.md) — end-to-end process to mount a separate game repo on krumath.com.

## Local

```sh
npm i
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000/quick-brain-racer/**. Auth is off in `npm run dev` so you can play locally.

For production, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the same values as KruMath (`NEXT_PUBLIC_SUPABASE_*`). Unsigned users then go to `/sign-in?returnUrl=/quick-brain-racer`.

## Production

1. Put the same Supabase URL and anon key as KruMath in `.env.local` (`VITE_SUPABASE_*`). Vite inlines them at **build** time.
2. `npm run build` then `npx nitro deploy --prebuilt` (or `npm run deploy`).
3. In Cloudflare, send `krumath.com/quick-brain-racer*` to this Worker (more specific than the main KruMath Worker).

## Your follow-ups (KruMath + Cloudflare)

Do these outside this repo after the Worker is live:

### Cloudflare
1. Deploy this Worker (`npm run deploy`).
2. Add a route on **krumath.com**: `krumath.com/quick-brain-racer*` → this Worker.
3. Keep the main **krumath** Worker for `/`, `/home`, `/sign-in`, etc.
4. Rebuild if you change Supabase keys (they are baked in at build time).

### KruMath (`D:\Coding Project\KruMath`)
1. No auth/redirect code changes — `/sign-in?returnUrl=/quick-brain-racer` already works.
2. Last: add a Play card/link on `/home#game-section` → `/quick-brain-racer`.
3. Skip middleware for this path if Cloudflare already routes it to this Worker.
