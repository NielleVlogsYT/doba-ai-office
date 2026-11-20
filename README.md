# The Bullpen

A cartoon AI office with five desks and one boss. You send a brief; Grant reads
it and proposes the right specialist; nothing starts until you approve it. The
work comes back to your desk for a final stamp.

## The staff

| Desk | Who | What they take |
| --- | --- | --- |
| Oversight | **Grant** — senior developer & IT | Every inbound brief, technical work, final technical review |
| Edit bay | **Josh** — video editor | Cuts, pacing, captions, thumbnails, exports |
| Education desk | **Mark** — educator | Lesson plans, study guides, research, citations |
| Money desk | **Ichim** — financial advisor (and your wife) | Budgets, spending reviews, trade-offs |
| Calendar desk | **Rex** — scheduler | Weeks, meetings, deadlines, reminders |

Click any desk to chat with that agent or read their work. Your empty gold chair
at the front of the floor opens the decision desk.

## The rule that shapes everything

1. You send a brief. Grant triages it and puts a routing card on your desk.
2. You approve the routing (or reassign the desk). The work starts only then.
3. The agent's draft arrives with a decision: approve it, or send it back.
4. Agents never claim to have sent, spent, published, scheduled or committed
   anything. Those actions stay with you.

Routing, tasks, chats, decisions and the work log persist in this browser's
`localStorage` — one office per browser, no account needed.

## Run it

```sh
bun install
bun run dev        # http://localhost:3000
bun run typecheck
bun run build      # dist/client (assets) + dist/bullpen/index.js (Worker)
```

## Live reasoning vs demo mode

Without an API key the office runs on **scripted demo replies**: every desk has
real, role-specific sample answers, and all routing and approval mechanics work.
The header shows "Demo mode" until a key is present.

For live agent reasoning the Worker calls the Freebuff API (OpenAI-compatible)
with `OPENAI_API_KEY` from its environment:

- Locally: put it in `.env` (see `.env.example`). Do not add `.dev.vars`; its
  presence stops Wrangler reading `.env`.
- Freebuff Cloud: Settings → Secrets → `OPENAI_API_KEY`.
- Freebuff Sites: deploy once, then Sites → Secrets → `OPENAI_API_KEY`.
- Create and fund a key at <https://freebuff.com/account/api>.

The key is read only inside the Worker and never reaches the browser. The app
tells the browser only whether a key is configured. Never paste the key into
chat or commit it.

The Worker enforces a model allowlist (`MODELS`), caps replies at
`MAX_OUTPUT_TOKENS`, trims history, caps briefs at 4,000 characters, refuses
foreign-origin POSTs and applies a best-effort per-IP daily request limit. Those
limits protect the owner's credits. For a widely shared deployment, add
Sign in with Freebuff so only you can spend them.

## Make it yours

- **Roster, voices, routing rules:** `src/shared/config.ts` (names, titles,
  colours, specialties, greetings) and `src/shared/routing.ts` (keyword triage).
- **Personas and decision protocol:** `src/worker/prompt.ts`.
- **Scripted demo replies:** `src/worker/demo.ts`.
- **Illustration:** `src/app/components/Character.tsx` (desks) and
  `OfficeStage.tsx` (the room).
- **Design tokens:** `src/styles.css`.

Agent replies may end with a hidden `<decision>{...}</decision>` line. The
Worker parses and strips it, then surfaces it as a decision card. Without that
line, a reply is just conversation.

## Deploy to Freebuff Sites

```sh
bun run build
```

`sites_create`, then `sites_deploy` with `deploy.json`. The Worker serves the API
and the SPA assets. Add the API key in Sites → Secrets afterwards. No database
or auth bindings are required for this version.
