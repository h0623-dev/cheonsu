const CACHE_VERSION = "cheonsu-v199115";
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const FINAL_STAGE_MAPS = Array.from(
  { length: 30 },
  (_, index) => `/maps/concept/stage_${index + 1}_frontier_final.png`
);
const ENEMY_VARIANT_KEYS = [
  "raider",
  "marauder",
  "assassin_elite",
  "sniper",
  "ranger",
  "pyromancer",
  "frost_mage",
  "cultist",
  "sentinel",
  "blackguard",
  "warlord",
  "void_knight",
];
const ENEMY_VARIANT_SPRITES = ENEMY_VARIANT_KEYS.flatMap((key) => [
  `/sprites/map_units/${key}.png`,
  `/sprites/enemies/${key}.png`,
  `/sprites/sd_units/${key}.png`,
]);

const APP_SHELL_FILES = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/updates/latest.json",
  "/ui/main_menu_bg.png",
  "/ui/cheonsu_logo.png",
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
  "/sprites/units/kyle.png",
  "/sprites/units/bram.png",
  "/sprites/units/lina.png",
  "/sprites/units/aria.png",
  "/sprites/units/leon.png",
  "/sprites/units/sera.png",
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
  "/sprites/classic/units/wolf.png",
  ...ENEMY_VARIANT_SPRITES,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const isStaticAsset = /\.(?:js|css|png|jpg|jpeg|svg|webp|gif|woff2?)$/i.test(url.pathname);

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html")))
    );
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchAndCache = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
            }
            return response;
          });

        return cached || fetchAndCache;
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
