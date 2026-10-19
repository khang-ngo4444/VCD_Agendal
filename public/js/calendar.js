// Calendar (views/calendar.ejs). The day and week layouts open scrolled to the morning rather than midnight.

function setUpCalendar() {
  const scroller = document.querySelector('[data-calendar-scroll]');
  if (scroller && !scroller.dataset.scrolled) {
    scroller.scrollTop = Number(scroller.dataset.calendarScroll);
    scroller.dataset.scrolled = 'true';
  }
}

setUpCalendar();
document.addEventListener('agendal:render', setUpCalendar);
