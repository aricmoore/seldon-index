# SESSION_STATE

## Current task
Hackathon build for FAI's "Best in Show" — renamed mid-build from "American Innovation Index" to **Seldon Index** (Asimov's *Foundation* reference, playing on the org's own name). Live Bloomberg-terminal-style ticker: Claude classifies audience-submitted headlines into AI/Energy/Defense/Space with a scaled delta, plus a "Fellow Watch" tool that searches the real federal record for FAI staff citations.

**Live URL:** https://seldon-index.arielle-moore.workers.dev (deployed, working, KV state clean-seeded as of this writing)

## Status: feature-complete, not yet committed to git
All four build tiers plus Fellow Watch are done and verified end-to-end (curl + Playwright screenshots) both locally and on the deployed URL:
- Tier 1: `worker/classifier.ts` — Claude Haiku 4.5, forced tool-use, structured `{valid, category, impact, rationale}`. Falls back to keyword `scorer.ts` if the API call throws.
- Tier 2: category sub-indices (AI/Energy/Defense/Space) with 4-up sparklines in `src/App.tsx`.
- Tier 3: Fellow Watch (`worker/fellowWatch.ts`) — searches GovInfo (name + "Foundation for American Innovation" co-occurrence required) and regulations.gov (adjacent-phrase name match on `title`, since the list endpoint has no structured submitter-name field). Results carry a `confidence: 'confirmed' | 'possible'` tag, rendered as a solid vs. dashed badge in the UI. Verified fellow list: Samuel Hammond, Zach Graves, Dan Lips, Luke Hogg, Soren Dayton, Daniel King.
- Tier 4: circuit-breaker banner on `|delta| >= 32`.
- Visual polish: number tween, delta flash, animated tape rows, sparkline draw-in, live pulse dot, on-brand loading state.
- Easter egg: ~12.5% chance of a "Let's win." tape entry after a valid live submission, delta 0.
- Em-dash and Claude/Anthropic-mention audit: source and built client bundle are clean.

## Decisions made and why
- **Dropped the Claude-quote-extraction step** for Fellow Watch (originally planned) — reading full hearing transcripts (one was 368 pages) live is slow/costly/hallucination-prone. Show raw GovInfo/regulations.gov metadata (title/date/link) directly instead; more defensible than an AI paraphrase.
- **GovInfo query requires the org name to co-occur** with the person's name, not just a collection filter — plain name search let historical namesakes (1858 Senate reports, etc.) through for common names. Zero false positives in testing after adding this; costs some recall (e.g., Tim Hwang's real 2021 testimony doesn't co-mention FAI, likely predates his affiliation — deliberately excluded from the "confirmed" tier for that reason).
- **regulations.gov added as a second source**, then found to have false positives (reversed names, multi-signer comments) — fixed with an adjacent-phrase regex (`First Last` or `Last, First` as a contiguous match), not independent word-boundary checks. Residual risk (common-name coincidence, e.g. a comma-list attributing two different people's names next to each other) is handled by labeling these `confidence: 'possible'` rather than hiding or overclaiming.
- **KV read-modify-write race**: confirmed real via load testing (5 concurrent submissions → only 1-2 survive). Attempted an optimistic-retry mitigation; testing showed it only marginally helps because Cloudflare KV is eventually consistent (not just missing compare-and-swap) — a `get` right after a `put` isn't guaranteed to see it. A full fix needs Durable Objects. **User decision: accept as a known, documented limitation** rather than migrate to DO this late. Don't re-litigate this — it's a considered tradeoff, not an oversight.
- **Renamed to Seldon Index**: new Cloudflare Worker (`seldon-index`, since `wrangler.jsonc`'s `name` field controls the subdomain) with its own secrets set. Old `american-innovation-index` Worker was deleted (user's choice, to avoid old-branding confusion on demo day) after confirming the new one worked end-to-end.
- **Real secret-corruption bug found and fixed**: piping `grep | cut | wrangler secret put` included a trailing newline in the stored secret, which threw `TypeError: Invalid header value` when used as an HTTP header (Anthropic's `x-api-key`) — silently fell back to the keyword scorer. Fixed by piping through `printf '%s'` instead. This is exactly the kind of thing the "redeploy and verify" hardening step is for — don't skip it in future.

## Open questions / not yet done
- **Nothing is committed to git yet** (`git status` shows all of today's changes unstaged, plus 3 untracked files: `worker/classifier.ts`, `worker/env.d.ts`, `worker/fellowWatch.ts`). User was about to decide whether to commit — resume by asking if they still want that, don't assume.
- **Full timed demo rehearsal** not yet run against the live URL.
- Literal "fresh clone in a temp dir" test wasn't done as originally planned — lower priority now since the demo runs off the deployed URL, not a local checkout, so that specific risk is already covered by deployment. Worth doing only if committing first.

## Do-not-re-read list (stable, fully understood, already tested)
- `worker/index.ts`, `worker/classifier.ts`, `worker/fellowWatch.ts`, `worker/types.ts`, `worker/seed.ts`, `worker/scorer.ts`, `worker/env.d.ts`
- `src/App.tsx`, `src/Sparkline.tsx`, `src/styles.css`
- `wrangler.jsonc`, `package.json`, `index.html`, `README.md`
All of the above are in their final, tested state as of this session. Only re-read if the user reports a specific new bug in one of them.

## Infra reference
- KV namespace ID: `9ae990aec2c3462781beec99769829bf` (binding `AII_KV`)
- Secrets set (remote, on `seldon-index` Worker): `ANTHROPIC_API_KEY`, `GOVINFO_API_KEY` (also in local `.dev.vars`, gitignored)
- GovInfo/regulations.gov API key came from api.data.gov (shared key, works for both services)
- Local dev: `npx wrangler dev --port 8787` (has a known flaky SQLite-lock crash on hot-reload after `npm run build` touches `dist/client` — just `rm -rf .wrangler/state` and restart, it's a wrangler-local-only quirk, doesn't affect the deployed Worker)
