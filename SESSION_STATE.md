# SESSION_STATE

## Current task
Full visual/data redesign of Seldon Index for FAI's "Best in Show" demo, on top of the already-shipped feature-complete build from the prior session. User reviewed the live app and wanted: a real Bloomberg-terminal-style multi-panel layout, a 6-sector taxonomy replacing the old 4 categories, contributor attribution + leaderboard, a real external data signal, FAI brand (logo, orange #FF4F00, self-hosted fonts), and light/dark mode. Plan approved and fully implemented this session (plan file: `~/.claude/plans/functional-rolling-chipmunk.md`).

**Live URL:** https://seldon-index.arielle-moore.workers.dev (deployed, verified end-to-end via curl + Playwright, both themes, both KV-reseeded)

## Status: feature-complete, deployed, verified live — NOT yet committed to git
User said "everything has already been committed" at the start of this session referring to the prior redesign — that was true then (`git status` was clean). All work described below is new, uncommitted local changes from this session. User has not asked to commit; don't commit without being asked.

Modified: `index.html`, `src/App.tsx`, `src/Sparkline.tsx`, `src/styles.css`, `worker/classifier.ts`, `worker/index.ts`, `worker/scorer.ts`, `worker/seed.ts`, `worker/types.ts`.
New: `worker/categories.ts`, `worker/externalSignals.ts`, `public/fonts/` (3 font files), `public/favicon/` (pre-existed from user, now wired into `index.html`).

## What shipped this session
- **6-sector taxonomy** replacing AI/Energy/Defense/Space: Technology & Statecraft (#FFA300), Artificial Intelligence (#D63A8C), American Governance (#8265DB), Energy & Infrastructure (#268B41), Science & Innovation (#4997D0), Frontier Legal Defense (#3A4A6B, litigation/regulatory — not military). Single source of truth in `worker/categories.ts` (`PILLAR_CATEGORIES` array with id/color/shortLabel/description/keywords), imported by classifier schema+prompt, keyword-fallback scorer, seed data, and frontend — nothing hardcodes the category list in more than one place anymore.
- **Full terminal grid redesign** in `src/App.tsx`/`src/styles.css`: CSS Grid (`.terminal-grid`, named areas), collapses to one column under 900px. Panels: Index (hero + sparkline + session high/low), Sector Board (6-row ranked quote-board with per-sector sparklines), Market Movers (biggest live gain/loss, client-derived), File a Wire, Signals (external data), Wire Tape, Top Contributors, Fellow Watch (unchanged logic, re-skinned).
- **Attribution + leaderboard**: `IndexEvent.submittedBy?: string` (optional, not required). Wire form has an optional "Filed by" field, persisted in `localStorage`. Leaderboard ranks by cumulative `|delta|` moved (not submission count), derived entirely client-side from `state.events` — no backend aggregate, no new KV shape.
- **External live signal**: `worker/externalSignals.ts` hits the real, keyless Federal Register API (DOE/FERC/NRC/NSF/FCC document counts, this week vs last), cached in its own KV key (`external-signals-cache`, 12 min TTL) with stale-serve/degraded fallback — mirrors the existing `classifyWithFallback`/Fellow Watch resilience pattern. New route `GET /api/external-signals`.
- **Light/dark mode**: `data-theme` on `<html>`, toggle button in header, `localStorage`-persisted, defaults to system preference. FAI orange `#FF4F00` used only for brand/UI chrome (header, CTA, focus rings, live-dot, toggle) — never reused as a sector color.
- **Fonts, self-hosted, zero CDN**: `SchmalfetteCP.otf` (FAI's real headline font, pulled directly from thefai.org — user confirmed they have rights to reuse it) for the masthead title only; IBM Plex Sans Regular/Bold (open SIL license, sourced from Google Fonts' static files) for body copy, replacing `system-ui`. Verified via Playwright: zero external font requests, `getComputedStyle` confirms both fonts resolve correctly.
- **Logo**: FAI lockup top-right of header, directly beside the Schmalfette-styled title, swapping `Lockup-Black.png` (light theme) / `Lockup-White 2.png` (dark theme) from the existing `public/images/`.
- **Favicon**: wired `public/favicon/favicon.png` into `index.html` (was sitting unused before).
- **Byline added**: "We are quantifying civilisational trajectory. Let's win." — static, italic, one-time, under the header.
- **Easter egg removed**: the old 12.5%-chance random "Let's win." tape insert (`EASTER_EGG_CHANCE` in `worker/index.ts`, `'easter-egg'` source type, related CSS/JSX) is fully deleted. Do not confuse this with the byline above, which intentionally also ends in "Let's win." — that's deliberate, not a leftover.

## Decisions made and why
- **KV reset required, not a migration layer**: the deployed KV namespace already had persisted state in the old 4-category shape. `loadState()` only reseeds on a fully-missing key, so it wouldn't auto-detect the taxonomy change. Deliberately did NOT write a translation layer (not worth it for a one-off demo reset) — instead deleted the `state` KV key after deploying so it reseeds fresh under the new taxonomy. **Learned the hard way**: the first `wrangler kv key delete` reported success but the key was still readable seconds later — this was NOT KV eventual-consistency, it was a fluke of the CLI (unclear why); a second delete attempt, verified immediately with `wrangler kv key get` returning a 404, actually worked. If you ever need to reset this KV key again, verify the delete with an immediate `get` before trusting it.
- **Wire Tape headlines are not clickable links, unlike Fellow Watch citations.** User asked about this directly. Fellow Watch citations link to real government documents (verified sources). Wire Tape headlines are freeform crowd submissions validated only by an LLM plausibility check, with no captured source URL — making them look like links would overstate their sourcing. Left as plain text; user did not ask to change this, but it's a one-field addition (`sourceUrl` on the wire form) if they want it later.
- **External signal scoped down to one aggregate tile**, not a per-sector breakdown, per the research agent's own recommendation and the user's 4-hour time budget: "Federal Regulatory Pulse" covers a fixed agency set (DOE/FERC/NRC/NSF/FCC), not all 6 sectors individually. Real, live, verified-in-session data (not mocked).
- **Fixed 3 self-introduced em-dashes** in new copy (tape attribution line, external signal label, one category description) to match the project's existing, deliberate house rule against em-dashes anywhere in output (the classifier prompt explicitly forbids them and regex-strips them from Claude's rationale text) — used middots instead, consistent with existing separators elsewhere in the UI.
- **Sector-to-old-category mapping** (a judgment call, not specified by the user): old Space → Science & Innovation; old Defense (contractors/export controls) → Technology & Statecraft; old catch-all "Other" items → American Governance. Frontier Legal Defense is genuinely new territory (litigation/regulatory enforcement for/against frontier tech) with no old equivalent — gave the classifier prompt explicit positive examples since nothing in the prior schema covered it.
- **SchmalfetteCP font rights**: confirmed with user before pulling the font file directly from thefai.org's own CDN and self-hosting it in this repo (it's likely a commercial webfont normally domain-locked to thefai.org) — user said they have rights to reuse it since this is an internal/sanctioned FAI project.

## Open questions / not yet done
- **Not committed to git.** User has not asked for a commit this session — confirm before committing.
- **Full timed demo rehearsal** against the live URL still hasn't been run (carried over from prior session's open item too).
- Wire Tape source-link field (see decision above) — only build if user asks.
- The KV reset means all pre-existing live/user-submitted tape history from before this session is gone (expected and intended — it was in the old taxonomy shape anyway).

## Do-not-re-read list (stable, fully understood, already tested this session)
- `worker/categories.ts`, `worker/types.ts`, `worker/classifier.ts`, `worker/scorer.ts`, `worker/seed.ts`, `worker/index.ts`, `worker/externalSignals.ts`, `worker/fellowWatch.ts` (untouched), `worker/env.d.ts` (untouched, fine as-is — `worker-configuration.d.ts` is the real generated Env source)
- `src/App.tsx`, `src/Sparkline.tsx`, `src/styles.css`, `index.html`
- `wrangler.jsonc`, `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.worker.json`
All verified via `tsc`, `vite build`, local `wrangler dev` smoke tests across all 6 sectors, and Playwright screenshots of the live deployed URL in both themes plus mobile width. Only re-read if a specific new bug is reported.

## Infra reference (unchanged from prior session, still accurate)
- KV namespace ID: `9ae990aec2c3462781beec99769829bf` (binding `AII_KV`)
- New KV key this session: `external-signals-cache` (12 min TTL, independent of the main `state` key and its read-modify-write retry logic)
- Secrets (remote, on `seldon-index` Worker): `ANTHROPIC_API_KEY`, `GOVINFO_API_KEY` (also local `.dev.vars`, gitignored). No new secret needed for the Federal Register signal (fully keyless API).
- Local dev: `npx wrangler dev --port 8787`. If you hit the known flaky SQLite-lock crash on hot-reload, `rm -rf .wrangler/state` and restart.
- Font sourcing if you ever need to re-pull: `SchmalfetteCP.otf` from `https://thefai.org/fonts/SchmalfetteCP.otf`; IBM Plex Sans woff2 files from Google Fonts' `fonts.gstatic.com` (fetch `https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400` and `...@700` separately with a Chrome user-agent to get the correct per-weight woff2 URLs — a combined `wght@400;700` query returned mismatched/duplicate URLs in testing, request each weight individually).
