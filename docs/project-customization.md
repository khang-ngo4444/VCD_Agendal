# Projects customization

## Agreed structure

Projects is one navigation section. Its user-created items (for example University
or Work) contain tasks. This change does not introduce another hierarchy of task
groups or columns. Inbox remains the built-in destination for unassigned tasks.

## Checklist

- [x] Confirm the hierarchy with the owner before implementation.
- [x] Create/edit item names, arbitrary hex colours and optional emoji icons.
- [x] Show the same options through …, right-click and keyboard context keys.
- [x] Reorder only the signed-in user's items; keep sidebar and overview in sync.
- [x] Keep tasks/events when an item is deleted and explain the consequence.
- [x] Verify validation/draft retention, ownership, CSRF and safe redirects.
- [x] Exercise desktop/mobile layouts, focus, keyboard and menu dismissal.
- [x] Run automated suites, build CSS and record concrete results.

## Behaviour

- Open Projects in the sidebar to see all items. New item opens the full editor;
  quick-add on the overview remains available for a title-only item.
- Customize a name (1–60 characters), any six-digit hex colour, and one optional
  emoji, including joined emoji, skin tones and flags. The suggested emoji buttons
  are shortcuts; the text field accepts the user's own emoji. Clearing it restores
  the colour dot. This version does not upload image/SVG icon files.
- Each item offers the same Customize / Move up / Move down / Delete menu in the
  sidebar, overview and detail header. Open with …, right-click, Shift+F10 or the
  keyboard context key. Other parts of the page keep their normal context menus.
- Escape closes the menu and restores focus to …; in the mobile drawer it closes
  the menu first, with a second Escape closing the drawer. Outside clicks dismiss it.
- The editor previews changes before saving. Invalid fields keep the draft and
  focus the first error. Cancel discards edits without changing stored metadata.
- Items share one account-specific order in the overview and sidebar. Task creation
  and movement use the existing project assignment flow. Inbox stays built in.
- Old items without icon/order fields still work. Editing their metadata preserves
  their position; ordering is normalized only on a requested move. No reseed/reset
  or destructive migration is required.
- Deleting an item explains that tasks move to Inbox and events keep their dates
  with no project. Confirmation is required in the UI.
- Without JavaScript, editor fields, save/cancel, … links and movement forms remain
  usable. JS-only emoji shortcuts, colour-picker synchronization and preview are
  revealed only after the enhancement is loaded. Right-click requires JavaScript.

## Executed verification — 2026-10-21

- `npm test -- --runInBand`: 260 passing tests, 31 suites. New tests cover emoji
  validation, malformed fields, retained values, context-menu scope, keyboard,
  dismissal/focus, viewport positioning, colour synchronization and safe preview text.
- `npm run test:flows`: 176 passing HTTP/DB checks in a disposable local database.
  New cases cover custom create/edit/clear, invalid input, legacy data, ordering,
  ownership, missing CSRF and external-return rejection. Existing deletion checks
  verify tasks/events are retained. Expected values are asserted against MongoDB
  and rendered HTML, not just status 200.
- `npm run css`: successful CSS build.

| Browser case | Observed result |
| --- | --- |
| Create item with custom colour and emoji | Saved QA Custom Studio with 🎨 and #1a7b9c; preview, detail and sidebar agree |
| Right-click item / use … | Both open the same Customize/Move/Delete options |
| Escape / Shift+F10 | Close restores focus; keyboard context opens and focuses Customize |
| Invalid name / colour | Error appears at the field; emoji and other draft fields remain; focus reaches the invalid colour |
| Save all metadata | QA Design Lab, joined emoji 👩🏽‍💻 and #7948ba persist |
| Move up | Sidebar order changes and remains after navigation; HTTP also compares overview order |
| Create a task inside the item | QA Custom Item Task is linked to that item and its count becomes 0/1 |
| Cancel editing | Stored name stays QA Design Lab |
| Cancel deletion | Dialog describes retained tasks/events; item and task remain |
| Mobile sidebar menu | Visible above the drawer; panel stays inside viewport with 8px margin; Escape leaves drawer open |
| Maximum 60-character unbroken name | Checked overview/detail/edit/new, Board and Today at 320/360/768/1280px: 24 combinations without root horizontal overflow |
| Light and dark | Inspected actual form, cards and open menu in both themes |

The browser cases used local UI-test DB `agendal_flow_ui_20261021` on port 3999.
They did not alter the user's `agendal` database. Raw local logs and layout samples
are in ignored `test-results/`. The separate UI-test server is stopped after QA;
the updated user-facing app runs on port 3000 with existing data.

Two issues found during QA were fixed: a transformed mobile drawer clipped fixed
menus (native popover top layer now keeps them visible), and long item names expanded
the overview's implicit grid column (explicit minmax-compatible columns and shrinkable
cards now contain them). Open menus and dirty editors also block live page replacement.

Browser verification used the available Chromium in-app browser. This does not
claim exhaustive device, screen-reader or cross-browser conformance. Older browsers
without native popovers use the positioned-details fallback; clipping in those
older transformed-drawer implementations has not been verified.
