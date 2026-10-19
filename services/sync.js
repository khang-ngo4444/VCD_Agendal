// Live updates between a user's open tabs and devices. Every app page keeps a Server-Sent Events stream open
// (GET /sync), and each change the user makes is announced on all their streams; the pages then fetch themselves
// again and swap in the new content (public/js/app.js). So the Daily List, Board and Calendar never show stale tasks.
// ponytail: the open streams live in this process's memory; with several server processes, announce through Redis
// pub/sub or a MongoDB change stream instead.
const streams = new Map(); // user id → Set of open responses

function subscribe(req, res) {
  const key = String(req.user._id);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
  res.flushHeaders();
  if (!streams.has(key)) streams.set(key, new Set());
  streams.get(key).add(res);
  req.on('close', () => {
    streams.get(key)?.delete(res);
    if (!streams.get(key)?.size) streams.delete(key);
  });
}

const TAB_ID = /^[a-z0-9]{1,32}$/; // the X-Tab-Id header goes into the stream, so nothing else may get through

// Any POST that went through is a change: announce it once the response is sent. The message is the id of the tab
// that made the change (sent by app.js on background posts), so that tab, which already shows it, can skip it.
function announceChanges(req, res, next) {
  if (req.method !== 'POST') return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const tab = req.get('X-Tab-Id') ?? '';
    const message = `data: ${TAB_ID.test(tab) ? tab : ''}\n\n`;
    streams.get(String(req.user._id))?.forEach((stream) => stream.write(message));
  });
  next();
}

module.exports = { subscribe, announceChanges };
