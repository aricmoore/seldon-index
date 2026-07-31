# Seldon Index

A live index for the health of American innovation. One number that moves up
and down based on real headlines, an event tape showing exactly why it moved,
and a form so anyone in the room can file a new headline and watch it react.
It runs as a single Cloudflare Worker with a Vite/React frontend on top, no
other project's data or infrastructure required.

## What's actually in here

The worker (`worker/index.ts`) serves the built frontend and a handful of
API routes, all backed by one Workers KV namespace:

- `GET /api/state`: the current index, the sub-index score for each of the
  six tracked sectors, and the event tape. Seeds itself with placeholder
  headlines the first time it's read.
- `POST /api/headline`: takes a headline, classifies it (an LLM call, with a
  keyword-based scorer in `worker/scorer.ts` as a fallback if that call
  fails or the classifier is unreachable), and appends the resulting event
  to the tape. Rate limited to 5 requests a minute per IP, since a bad actor
  could otherwise turn this into a way to run up someone's API bill.
- `GET /api/fellow-watch`: searches the federal record (GovInfo and
  regulations.gov) for a given name. Rate limited to 10 requests a minute
  per IP for the same reason.
- `GET /api/fellow-mentions`: runs that same federal-record search
  automatically for the fixed fellow roster in `worker/fellows.ts`, cached
  for 30 minutes so it isn't hammering those APIs on every page load.
- `GET /api/external-signals`: a live regulatory-activity count pulled from
  the Federal Register, cached for 12 minutes.

The frontend (`src/App.tsx`) polls `/api/state` every 5 seconds, with
slower separate polls for signals and fellow mentions, and renders all of
it: the hero index and its sparkline, a scrolling ticker built from real
wire and signal data, a sector leaderboard, market movers, the wire tape,
and Fellow Watch search.

## Worth knowing before you demo this

- The keyword scorer in `worker/scorer.ts` only kicks in when the real
  classifier can't be reached. It's a blunt instrument, fixed word weights
  summed up, and it can misfire on headlines that mix positive and negative
  words in the same sentence.
- The seed headlines in `worker/seed.ts` are placeholders, not verified
  real news. Swap them for real, current milestones before showing this to
  anyone.
- KV doesn't have real compare-and-swap, so two headlines submitted at the
  exact same instant could theoretically still race each other. There's a
  read-check-write retry in `worker/index.ts` that narrows the window a
  lot, but a Durable Object would be the actual fix if this ever needed to
  hold up at real scale.
- Rejected submissions (spam, off-topic, whatever the classifier bounces)
  still show up in the wire tape with a "rejected" label rather than being
  hidden. That's a deliberate choice for transparency, but worth knowing if
  someone spams the form right before a demo.

## Running it locally

```bash
npm install
npx wrangler types        # regenerate worker-configuration.d.ts after any wrangler.jsonc change

# terminal 1: the worker (API + KV, local simulation)
npm run worker:dev

# terminal 2: the frontend (proxies /api to the worker on :8787)
npm run dev
```

You'll need a local `.dev.vars` file with two secrets: an API key for the
headline classifier, and one for GovInfo (used by both Fellow Watch and
the federal-record lookups). Neither is committed anywhere.

Typecheck both halves before you deploy anything:

```bash
npm run build            # tsc (frontend) + vite build
npm run typecheck:worker # tsc for worker/
```

## Deploying

The KV namespace already exists and its id is sitting in `wrangler.jsonc`,
so deploying is just:

```bash
npm run deploy
```

If you ever need a fresh namespace, create one first and swap the id in:

```bash
npx wrangler kv namespace create AII_KV
```

## Demo script

1. Load the page. Confirm the seeded index, sparkline, and tape all render.
2. File a positive headline, something like "Startup announces breakthrough
   in battery manufacturing," and confirm the index ticks up with a green
   delta on the new row.
3. File a negative one, "Investigation opens after data breach" works fine,
   and confirm it drops with a red delta.
4. Before the actual demo, run through this once on the machine you're
   demoing from, not just the one you built it on: fresh `npm install`,
   real secrets in place, `npm run deploy`.
