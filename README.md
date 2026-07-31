# The Seldon Index

A live, deadpan-serious ticker for "the health of American innovation": one
running index number, an event tape of headlines that move it, and a form
that lets anyone file a new headline and watch the index react in real time.
Built as a standalone Cloudflare Worker + Vite/React app, with no dependency
on any other project's data or infrastructure.

## How it works

- **Worker** (`worker/index.ts`) serves the static frontend and two API
  routes, backed by a single KV record holding the running index and event log:
  - `GET /api/state`: current index value and event tape (seeds itself on
    first read if KV is empty)
  - `POST /api/headline`: takes `{ "headline": string }`, scores it with a
    keyword-based scorer (`worker/scorer.ts`), appends the resulting event,
    and returns the new index
- **Frontend** (`src/`) polls `/api/state` every 5s and renders the hero
  index number, a hand-rolled SVG sparkline, and the event tape.

## Known limitations (fine for a one-day demo, worth knowing)

- **Scoring is keyword-based, not real sentiment analysis.** It sums fixed
  weights for a fixed word list (`worker/scorer.ts`) and falls back to a
  small deterministic nudge if nothing matches. It can misfire on headlines
  that mix positive and negative words (for example "opens" and "launch"
  score positive even inside an otherwise negative headline about a failed
  launch).
- **Seed headlines are placeholders, not verified real news.** Swap
  `SEED_HEADLINES` in `worker/seed.ts` for ~10-15 real, current milestones
  before demoing.
- **KV read-then-write isn't atomic.** Two headlines submitted at the exact
  same instant could race and one could get lost. Irrelevant at demo-room
  scale, though it would need a Durable Object to fix properly if this became
  a real service.

## Local development

```bash
npm install
npx wrangler types        # regenerate worker-configuration.d.ts if wrangler.jsonc changes

# terminal 1: the Worker (API + KV, local simulation)
npm run worker:dev

# terminal 2: the frontend (proxies /api to the Worker)
npm run dev
```

Typecheck both halves independently before deploying:

```bash
npm run build            # tsc (frontend) + vite build
npm run typecheck:worker # tsc for worker/
```

## Deploy

1. Create the real KV namespace and paste its id into `wrangler.jsonc`
   (replacing `REPLACE_WITH_KV_NAMESPACE_ID`):
   ```bash
   npx wrangler kv namespace create AII_KV
   ```
2. Build and deploy:
   ```bash
   npm run deploy
   ```

## Demo script

1. Load the page, and confirm the seeded index value, sparkline, and tape render.
2. Submit a positive headline (for example "Startup announces breakthrough in
   battery manufacturing"), and confirm the index rises with a green up-arrow
   delta on the new row.
3. Submit a negative one (for example "Investigation opens after data
   breach"), and confirm it falls with a red down-arrow delta.
4. Run this from a clean checkout on the actual demo machine beforehand:
   fresh `npm install`, real KV namespace id in `wrangler.jsonc`, `npm run
   deploy`, since it will be shown from a different machine than it is built on.
