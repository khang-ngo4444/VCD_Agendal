// Overlapping items in one calendar day sit side by side. Each item takes the first lane that is free when it starts;
// every item in a group of overlaps gets that group's lane count, so the group splits the column width evenly.
// Items need startMinute and endMinute; lane (0-based) and lanes are added to each, and they come back sorted.
function assignLanes(items) {
  const sorted = [...items].sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);
  let group = [];
  let groupEnd = -1;
  const laneEnds = [];
  const closeGroup = () => {
    group.forEach((item) => (item.lanes = laneEnds.length));
    group = [];
    laneEnds.length = 0;
  };
  for (const item of sorted) {
    if (item.startMinute >= groupEnd) closeGroup();
    const free = laneEnds.findIndex((end) => end <= item.startMinute);
    item.lane = free === -1 ? laneEnds.length : free;
    laneEnds[item.lane] = item.endMinute;
    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMinute);
  }
  closeGroup();
  return sorted;
}

module.exports = { assignLanes };
