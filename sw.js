const CACHE = "speakwell-6";
const ASSETS = ["./", "./index.html", "./SpeakWell.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match("./index.html"));
    }),
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "schedule") return;
  const alarms = Array.isArray(event.data.alarms) ? event.data.alarms : [];
  event.waitUntil(
    Promise.all(
      alarms.map((alarm) => {
        const options = {
          body: alarm.body || "Tap and Speak Well will say it.",
          tag: `speakwell-${alarm.id}-${alarm.time}`,
          renotify: true,
          requireInteraction: true,
          vibrate: alarm.vibrate === false ? undefined : [500, 200, 500, 200, 800, 200, 500],
          silent: false,
          data: { line: alarm.line, id: alarm.id, time: alarm.time },
        };
        if (typeof TimestampTrigger === "function") options.showTrigger = new TimestampTrigger(alarm.when);
        else if (alarm.when - Date.now() > 90000) return Promise.resolve();
        return self.registration.showNotification(alarm.title || "Speak Well", options).catch(() => undefined);
      }),
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const line = (event.notification.data && event.notification.data.line) || "Time to take your medicine.";
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const page = open.find((client) => client.url.includes(self.location.origin)) || open[0];
      if (page) {
        page.postMessage({ type: "speak-alarm", line });
        return page.focus();
      }
      const opened = await self.clients.openWindow(`./?alarm=${encodeURIComponent(line)}`);
      if (opened) opened.postMessage({ type: "speak-alarm", line });
    })(),
  );
});
