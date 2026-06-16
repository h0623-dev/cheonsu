const CACHE_NAME = "cheonsu-v1-99-108";
const FINAL_STAGE_MAPS = Array.from(
  { length: 30 },
  (_, index) => `/maps/concept/stage_${index + 1}_frontier_final.png`
);

const CORE_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/promo/cheonsu_promo_main.png",
  "/updates/latest.json",
  "/ui/cheonsu_main_menu_art.png",
  "/maps/stage_1.jpg",
  "/maps/stage_2.jpg",
  "/maps/stage_3.jpg",
  "/maps/stage_4.jpg",
  "/maps/stage_5.jpg",
  "/maps/stage_6.jpg",
  ...FINAL_STAGE_MAPS,
  "/maps/classic/stage_1.png",
  "/maps/classic/stage_2.png",
  "/maps/classic/stage_3.png",
  "/maps/classic/stage_4.png",
  "/maps/classic/stage_5.png",
  "/maps/classic/stage_6.png",
  "/maps/classic/stage_7.png",
  "/maps/classic/stage_8.png",
  "/maps/classic/stage_9.png",
  "/maps/classic/stage_10.png",
  "/maps/classic/stage_11.png",
  "/maps/classic/stage_12.png",
  "/maps/classic/stage_13.png",
  "/maps/classic/stage_14.png",
  "/maps/classic/stage_15.png",
  "/maps/classic/stage_16.png",
  "/maps/classic/stage_17.png",
  "/maps/classic/stage_18.png",
  "/maps/classic/stage_19.png",
  "/maps/classic/stage_20.png",
  "/maps/classic/stage_21.png",
  "/maps/classic/stage_22.png",
  "/maps/classic/stage_23.png",
  "/maps/classic/stage_24.png",
  "/maps/classic/stage_25.png",
  "/maps/classic/stage_26.png",
  "/maps/classic/stage_27.png",
  "/maps/classic/stage_28.png",
  "/maps/classic/stage_29.png",
  "/maps/classic/stage_30.png",
  "/sprites/tiles/plain.png",
  "/sprites/tiles/forest.png",
  "/sprites/tiles/hill.png",
  "/sprites/tiles/fire.png",
  "/sprites/tiles/ice.png",
  "/sprites/tiles/fort.png",
  "/sprites/tiles/gate.png",
  "/sprites/tiles/road.png",
  "/sprites/tiles/dark.png",
  "/sprites/tiles/rune.png",
  "/sprites/tiles/trap.png",
  "/sprites/tiles/swamp.png",
  "/sprites/tiles/water.png",
  "/portraits/kyle.png",
  "/portraits/bram.png",
  "/portraits/lina.png",
  "/portraits/aria.png",
  "/portraits/leon.png",
  "/portraits/sera.png",
  "/portraits/bandit.png",
  "/portraits/archer.png",
  "/portraits/mage.png",
  "/portraits/shield.png",
  "/portraits/garon.png",
  "/sprites/enemies/wolf.png",
  "/sprites/classic/tiles/plain.png",
  "/sprites/classic/tiles/forest.png",
  "/sprites/classic/tiles/hill.png",
  "/sprites/classic/tiles/fire.png",
  "/sprites/classic/tiles/ice.png",
  "/sprites/classic/tiles/fort.png",
  "/sprites/classic/tiles/gate.png",
  "/sprites/classic/tiles/road.png",
  "/sprites/classic/tiles/dark.png",
  "/sprites/classic/tiles/rune.png",
  "/sprites/classic/tiles/trap.png",
  "/sprites/classic/tiles/swamp.png",
  "/sprites/classic/tiles/water.png",
  "/sprites/classic/units/hero.png",
  "/sprites/classic/units/bram.png",
  "/sprites/classic/units/lina.png",
  "/sprites/classic/units/aria.png",
  "/sprites/classic/units/leon.png",
  "/sprites/classic/units/sera.png",
  "/sprites/classic/units/bandit.png",
  "/sprites/classic/units/archer.png",
  "/sprites/classic/units/mage.png",
  "/sprites/classic/units/shield.png",
  "/sprites/classic/units/assassin.png",
  "/sprites/classic/units/boss_knight.png",
  "/sprites/classic/units/boss_mage.png",
  "/sprites/classic/units/garon.png",
  "/sprites/classic/units/wolf.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
