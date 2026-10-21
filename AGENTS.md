# Agendal — final project rules

Read this file before changing the Advanced Web Design final project. Read
`CLAUDE.local.md` and `HANDOFF.local.md` when present; they contain the owner's
local preferences and historical context. Historical implementation status must
be checked against the current code and Git history.

## Workflow

- The integration branch is `develop` (there is no `dev` branch). Fetch first,
  fast-forward only, preserve existing local changes, and create `feature/<name>`
  from the updated integration branch. Never commit directly to `main` or `develop`.
- Keep a task list for requests with several parts. Verify each meaningful change.
- Make small local commits once verified. Ask before push, PR, or external writes.
- Use short imperative commit messages under the configured Git identity, without
  a `Co-Authored-By` line. Do not delete teammates' branches without instruction.
- Trello card descriptions and acceptance criteria are the feature specification;
  README is product background. Report when Trello or Figma cannot be accessed.
- Preserve MVC boundaries, CommonJS, 2-space indentation, single quotes and semicolons.
  Read callers and shared utilities before editing. Prefer the smallest complete fix.
- Validate at request boundaries. Filter user-owned data by owner; exclude
  soft-deleted tasks with `deletedAt: null`. Inbox is `Task.project === null`.
- Use `services/dates.js` and the user's time zone for dates shown to the user.
- Render validation failures with HTTP 422, specific inline errors, and retained
  input. Use Post/Redirect/Get and flash feedback after successful mutations.
- Do not silently swallow errors, automatically replay uncertain mutations, or
  report success before the server confirms the result.

## UI and HCI

The complete supplied rule set is in [docs/hci-web-design.md](docs/hci-web-design.md).
Apply it to every UI change, including its workflow and verification limits.

- Reuse existing Figma tokens, themes and partials; justify accessibility changes
  to tokens and apply them consistently. Do not add arbitrary visual constants.
- WCAG 2.2 AA is the technical target; this supersedes the older local 2.1 AA wording.
  Check keyboard, focus, names, labels, contrast, error recovery and reflow at 320px.
- Prefer 44px targets for regular touch actions as a project design choice, while
  assessing the actual WCAG 2.5.8 minimum and its exceptions separately.
- Preserve valid user input and choices on error, Back, Cancel and live updates.
  Loading and failures must be visible, and failed submissions must be recoverable.
- Confirm destructive actions or provide an appropriate Undo. Do not expire the
  only recovery action before the user can use it.
- No PWA, offline cache or install flow. The incoming notification-only service
  worker conflicts with the older blanket service-worker ban; obtain the owner's
  decision before removing an existing team feature or declaring an exception.
- Run `npm test`, build CSS with `npm run css`, and exercise changed user flows.
  Inspect narrow and desktop layouts, light/dark themes and relevant error paths.
  State what is verified and what remains unverified; never claim user testing,
  complete WCAG conformance or field performance without evidence.
