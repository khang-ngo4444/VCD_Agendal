const Event = require('../models/Event');
const { formatTime } = require('./dates');
const { occurrences } = require('./recurrence');

// The occurrences of the user's events that overlap [from, to), soonest first (all-day ones first on their day).
// Each carries its event, colour (from its project, else the accent) and the edit link for that occurrence.
// `projects` is the sidebar list (res.locals.sidebarProjects).
async function eventsBetween(owner, from, to, timeZone, projects) {
  const events = await Event.find({
    owner,
    start: { $lt: to },
    $or: [
      { 'repeat.frequency': null, end: { $gt: from } },
      { 'repeat.frequency': { $ne: null }, $or: [{ 'repeat.until': null }, { 'repeat.until': { $gte: from } }] },
    ],
  }).lean();

  return events
    .flatMap((event) => {
      const project = event.project && projects.find((item) => item.id === String(event.project));
      return occurrences(event, from, to, timeZone).map((occurrence) => ({
        ...occurrence,
        event,
        allDay: event.allDay,
        colour: project?.colour ?? 'var(--color-primary)',
        projectName: project?.name ?? null,
        time: event.allDay ? 'All day' : `${formatTime(occurrence.start, timeZone)}–${formatTime(occurrence.end, timeZone)}`,
        href: `/events/${event._id}?occurrence=${occurrence.original.toISOString()}`,
      }));
    })
    .sort((a, b) => b.allDay - a.allDay || a.start - b.start);
}

module.exports = { eventsBetween };
