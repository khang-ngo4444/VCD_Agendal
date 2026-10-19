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
  if (!day || !dialog || event.target.closest('a, button')) return;
  const grid = day.closest('[data-hour]');
  const offset = (event.clientY - day.getBoundingClientRect().top) / Number(grid?.dataset.hour);
  const start = grid ? Math.floor((offset * 60) / SLOT_MINUTES) * SLOT_MINUTES : 9 * 60;
  dialog.querySelector('[name=scheduleDate]').value = day.dataset.day;
  dialog.querySelector('[name=scheduleStart]').value = clock(start);
  dialog.querySelector('[name=scheduleEnd]').value = clock(Math.min(start + 60, 23 * 60 + 59));
  dialog.showModal();
});

// Dragging a task: it follows the pointer in 15-minute steps, across days too, and keeps its length.
const DRAG_MINUTES = 15;
let drag = null;
let justDragged = false;

document.addEventListener('pointerdown', (event) => {
  const block = event.target.closest('[data-task-id]');
  const grid = block?.closest('[data-hour]');
  if (!grid || event.button !== 0) return;
  const grab = event.clientY - block.getBoundingClientRect().top;
  drag = { block, grid, grab, minutes: Number(block.dataset.minutes), x: event.clientX, y: event.clientY, moved: false };
});

document.addEventListener('pointermove', (event) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return; // a click, not a drag
  drag.moved = true;
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
  const { block, moved, target, minutes } = drag;
  drag = null;
  if (!moved || !target) return;
  justDragged = true; // the click that follows the drop must not open the task
  window.agendal.post(`/tasks/${block.dataset.taskId}/schedule`, {
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
