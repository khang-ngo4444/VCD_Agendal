# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Agendal: a personal task, habit, and calendar app built as the final project for the Advanced Web Design course. So far the repo has the Mongoose models (`models/`), a seed script (`scripts/seed.js`) and the ERD (`docs/`). There's no Express app (`app.js`) yet.

## Workflow

- **Trello is the task list:** board "VNUK - Advanced Web Design" (https://trello.com/b/QFOY5tFM/vnuk-advanced-web-design). Each phase is its own list (`P0 · Foundation · due Oct 19` … `P13 · Quality & release`), in build order from left to right, and cards inside a list are in build order too. Every card is due at the end of its phase. The deadline is Nov 8, 2026. Each card's description is its spec, its "Done when" line is the acceptance check, and its **Figma:** line links the screen to build. The "Roadmap & workflow" card in Introduction has the overview.
- **Card flow:** phase list → In progress (branch created) → Testing (PR open into `develop`) → Done (PR merged; tick it complete). Postponed holds stretch goals (GitHub sign-in, migrations, AI assistant).
- **Design:** Figma file https://www.figma.com/design/yfBncVDLSo6yRWTvzBak8x/Web-Design--%C4%90%C3%ACnh-?node-id=24-604 (fileKey `yfBncVDLSo6yRWTvzBak8x`). Page "04 · Web (Desktop)" has the screens W01–W36 in light and dark; page "00 · Design System" has the tokens (Inter type, 4-pt spacing, 260 px sidebar, 1100 px max content) and components. Build UI from those tokens and components, not ad-hoc values. Figma names differ from the cards: "Today" = Daily List, "Insights" = Statistics. Habits and Admin screens are not designed yet.
- **Scope:** Premium and payments are out. Statistics and CSV export are free for every user. Calendar events (separate from tasks), the Upcoming view, focus mode and offline sync are in scope because they are in the Figma design.
- **`README.md` is background:** it describes the whole product. Where it disagrees with a card (e.g. README "categories" vs card "projects"), the card wins.
- **Git Flow (README "Development Flow"):** branch `feature/<name>` or `task/<name>` from `develop`, then open a PR back into `develop`. Never commit directly to `main` or `develop`.

## Working rules (3-person team)

1. **Sync before any work.**
   - Run `git fetch --prune origin` and fast-forward `develop` (`git merge --ff-only origin/develop`).
   - Note any new teammate commits or branches, and which of our branches have merged.
   - On Trello, check "In progress", "Testing", card members and recent board activity, so you don't take a card someone else already has.
   - Report a short status before starting.
2. **Start a card:**
   - Read its description, "Done when" line and Figma screen; use the README for background only.
   - Branch from the fresh `develop`, move the card to "In progress", and add yourself to it.
3. **One card per branch** (closely related cards may share one, with one commit per card). The work is finished when the card's "Done when" check passes, verified by running it.
4. **Ask before every commit, push and PR.**
   - Show the files and the commit message first.
   - End commit messages with the `Co-Authored-By:` line when Claude wrote the change.
5. **PRs:**
   - The `gh` CLI isn't installed. After pushing, give the compare link with `develop` as the base: `https://github.com/khang-ngo4444/VCD_Agendal/compare/develop...<branch>?expand=1`. GitHub's default "pull/new" link targets `main`.
   - Move the card to "Testing" when the PR is open, and to "Done" (ticked complete) once it's merged.
   - Delete merged branches only when asked.
6. **Trello API quirks (Trello MCP tools):**
   - Card `pos` must be an integer; fractional values get scrambled, so space positions by 1000.
   - The tools can't untick "complete", rename labels or add card members; ask a person to do those.
   - Due dates are 10:00 UTC (17:00 ICT) at the end of the card's phase.

## Commands

- `npm run seed`: replaces the demo user (`demo@agendal.app`) and its 4 projects, 40 tasks and 4 reminders. It's idempotent.
- `npm test` is still the npm placeholder and always fails.
- Env vars are loaded with Node's native `--env-file-if-exists=.env` flag in npm scripts, not dotenv. Use the same flag for new scripts. A variable set in the shell overrides `.env`.
- ERD: edit `docs/erd.mmd`, then re-render `docs/erd.png` with the command at the top of that file.
- Planned: Tailwind v4 CLI (`npx @tailwindcss/cli -i <input.css> -o public/css/style.css --watch`) and `node --watch app.js` (Node 22 doesn't need nodemon).

## Stack notes (check the versions before writing code)

- **Express 5**: async handlers forward rejected promises to the error middleware on their own. `express.json()` and `express.urlencoded()` are built in, so the installed `body-parser` is redundant.
- **Tailwind CSS v4 + DaisyUI 5**: configuration is CSS-first. There's no `tailwind.config.js`. Use `@import "tailwindcss";` and `@plugin "daisyui";` in the input CSS.
- **Mongoose 9**, **EJS 7** (server-side rendered).
- Files are CommonJS (`package.json` has no `"type"` field). `"main"` says `index.js`, but the README plans `app.js` as the entry point. Make them match when you create the entry file.

## Data model (see `docs/erd.png`)

User, Project, Task and Reminder. Every document except User has an `owner` field.

- **Per-user isolation**: filter every query by `owner`.
- **Inbox**: `Task.project === null`. There's no Inbox document.
- **Soft delete**: `Task.deletedAt`. Nothing filters it automatically, so add `deletedAt: null` to every task query.
- **Kanban**: `Task.status` is the column (`backlog | upcoming | active | done`) and `Task.order` is the position inside it.
- **Repeat**: `Task.repeat.frequency` is unset for tasks that don't repeat.
- **Reminder job**: queries `{ sent: false, remindAt <= now }`, which is backed by the `sent_1_remindAt_1` index.

## Planned architecture (per README)

Server-rendered MVC: routes → controllers → services → models, with EJS views in feature folders. Reminders, recurring-task generation and daily summaries run as background jobs, outside the request cycle. `/admin` routes need an administrator.

Environment variables (`.env`, gitignored; template `.env.example`): `PORT`, `NODE_ENV`, `MONGODB_URI`, `SESSION_SECRET`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`.
