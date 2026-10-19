// Calendar (views/calendar.ejs). The day and week layouts open scrolled to the morning rather than midnight, and
// clicking an empty part of a day opens the New task dialog for that slot.

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
