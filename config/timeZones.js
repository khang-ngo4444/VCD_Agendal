// IANA time zones for the profile and welcome pickers, labelled like "Asia/Tokyo (GMT+9)".
const ZONES = Intl.supportedValuesOf('timeZone');

function isValidTimeZone(zone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// ponytail: offsets are computed once per process, so a DST change shows the old offset until the next restart.
const labels = new Map();
function label(zone) {
  if (!labels.has(zone)) {
    const offset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName').value;
    labels.set(zone, `${zone.replaceAll('_', ' ')} (${offset})`);
  }
  return labels.get(zone);
}

// Node lists some zones under an older alias (Asia/Saigon for Asia/Ho_Chi_Minh), so keep the user's own zone in the list.
function timeZoneOptions(current) {
  const zones = ZONES.includes(current) || !isValidTimeZone(current) ? ZONES : [...ZONES, current].sort();
  return zones.map((zone) => ({ value: zone, label: label(zone) }));
}

module.exports = { isValidTimeZone, timeZoneOptions };
