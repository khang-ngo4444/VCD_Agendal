# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Agendal: a personal task, habit, and calendar app built as the final project for the Advanced Web Design course. So far the repo has the Mongoose models (`models/`), a seed script (`scripts/seed.js`) and the ERD (`docs/`). There's no Express app (`app.js`) yet.

## Workflow

- **Trello is the task list:** board "VNUK - Advanced Web Design" (https://trello.com/b/QFOY5tFM/vnuk-advanced-web-design). The Backlog list is sorted in development order, so take cards from the top. Divider cards (`━━ P4 · Projects & tasks · due Oct 29 ━━`) mark the phases, and every card is due at the end of its phase. The deadline is Nov 8, 2026. Each card's description is its spec and its "Done when" line is the acceptance check. The "Roadmap & workflow" card in Introduction has the phase table.
- **Card flow:** Backlog → In progress (branch created) → Testing (PR open into `develop`) → Done (PR merged; tick it complete). Postponed holds stretch goals.
- **Scope:** Premium and payments are out. Statistics and CSV export are free for every user.
- **`README.md` is background:** it describes the whole product. Where it disagrees with a card (e.g. README "categories" vs card "projects"), the card wins.
- **Git Flow (README "Development Flow"):** branch `feature/<name>` or `task/<name>` from `develop`, then open a PR back into `develop`. Never commit directly to `main` or `develop`.

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
