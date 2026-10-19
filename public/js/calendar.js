// Calendar (views/calendar.ejs). The day and week layouts open scrolled to the morning rather than midnight,
// clicking an empty part of a day opens the New task dialog for that slot, and tasks can be dragged to another
// time (pointer events, so mouse and touch both work).

const SLOT_MINUTES = 30;
const pad = (number) => String(number).padStart(2, '0');
const clock = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

function setUpCalendar() {
  const scroller = document.querySelector('[data-calendar-scroll]');
  if (scroller && !scroller.dataset.scrolled) {
    scroller.scrollTop = Number(scroller.dataset.calendarScroll);
    scroller.dataset.scrolled = 'true';
  }
}

setUpCalendar();
document.addEventListener('agendal:render', setUpCalendar);

// The clicked half hour in the day and week layouts; on the month layout the day at 09:00.
document.addEventListener('click', (event) => {
  const day = event.target.closest('[data-day]');
  const dialog = document.getElementById('slot-dialog');
  if (!day || !dialog || event.target.closest('a, button, details')) return; // links, buttons and the habit list keep their own clicks
  const grid = day.closest('[data-hour]');
  const offset = (event.clientY - day.getBoundingClientRect().top) / Number(grid?.dataset.hour);
  const start = grid ? Math.floor((offset * 60) / SLOT_MINUTES) * SLOT_MINUTES : 9 * 60;
  dialog.querySelector('[name=scheduleDate]').value = day.dataset.day;
  dialog.querySelector('[name=scheduleStart]').value = clock(start);
  dialog.querySelector('[name=scheduleEnd]').value = clock(Math.min(start + 60, 23 * 60 + 59));
  dialog.showModal();
});

// Dragging a task: it follows the pointer in 15-minute steps, across days too, and keeps its length.
// A task dragged in from the Unscheduled panel gets a placeholder block an hour long.
const DRAG_MINUTES = 15;
const NEW_TASK_MINUTES = 60;
let drag = null;
let justDragged = false;

document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const listed = event.target.closest('[data-unscheduled-id]');
  const block = event.target.closest('[data-hour] [data-task-id]');
  const grid = document.querySelector('[data-hour]');
  if (listed && grid) {
    drag = { listed, grid, taskId: listed.dataset.unscheduledId, grab: 0, minutes: NEW_TASK_MINUTES };
  } else if (block) {
    drag = { block, grid, taskId: block.dataset.taskId, grab: event.clientY - block.getBoundingClientRect().top, minutes: Number(block.dataset.minutes) };
  } else return;
  Object.assign(drag, { x: event.clientX, y: event.clientY, moved: false });
});

// The placeholder for a task coming from the Unscheduled panel, styled like the task blocks.
function placeholderFor(listed) {
  const block = document.createElement('div');
  block.className = 'pointer-events-none absolute overflow-hidden rounded-field border-2 border-primary bg-base-100 px-1.5 py-1 text-xs leading-tight shadow-md';
  block.style.height = `${(NEW_TASK_MINUTES / 60) * Number(drag.grid.dataset.hour)}px`;
  const title = document.createElement('span');
  title.className = 'block truncate font-semibold';
  title.textContent = listed.querySelector('a').textContent;
  const time = document.createElement('span');
  time.className = 'block text-muted';
  time.dataset.time = '';
  block.append(title, time);
  listed.classList.add('opacity-40');
  return block;
}

document.addEventListener('pointermove', (event) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return; // a click, not a drag
  drag.moved = true;
  drag.block ??= placeholderFor(drag.listed);
  const day = document.elementsFromPoint(event.clientX, event.clientY).find((element) => element.matches('[data-day]') && drag.grid.contains(element));
  if (!day) return;
  const hour = Number(drag.grid.dataset.hour);
  const top = event.clientY - drag.grab - day.getBoundingClientRect().top;
  const start = Math.max(0, Math.min(24 * 60 - drag.minutes, Math.round((top / hour) * (60 / DRAG_MINUTES)) * DRAG_MINUTES));
  if (drag.block.parentElement !== day) day.append(drag.block);
  Object.assign(drag.block.style, { top: `${(start / 60) * hour}px`, left: '2px', width: 'calc(100% - 4px)', zIndex: 30 });
  const time = drag.block.querySelector('[data-time]');
  if (time) time.textContent = `${clock(start)}–${clock(start + drag.minutes)}`;
  drag.target = { date: day.dataset.day, start };
});

document.addEventListener('pointerup', () => {
  if (!drag) return;
  const { listed, block, moved, target, minutes, taskId } = drag;
  drag = null;
  if (moved) justDragged = true; // the click that follows the drop must not open the task
  if (!target) {
    if (listed) block?.remove(); // dropped outside the calendar: the task stays unscheduled
    listed?.classList.remove('opacity-40');
    return;
  }
  window.agendal.post(`/tasks/${taskId}/schedule`, {
    scheduleDate: target.date,
    scheduleStart: clock(target.start),
    scheduleEnd: clock(target.start + minutes),
    returnTo: location.pathname + location.search,
  });
});

document.addEventListener(
  'click',
  (event) => {
    if (!justDragged) return;
    justDragged = false;
    event.preventDefault();
    event.stopPropagation();
  },
  true
);

// A touch that turns into scrolling cancels the drag.
document.addEventListener('pointercancel', () => {
  if (drag?.listed) drag.block?.remove();
  drag?.listed?.classList.remove('opacity-40');
  drag = null;
});
