import { memo, useMemo, useSyncExternalStore } from 'react';
import { getMapAtmosphereLayout } from '../engine/mapAtmosphere.js';
import './battle-map-atmosphere.css';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const COARSE_POINTER = '(pointer: coarse)';
const readReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const readCoarsePointer = () => window.matchMedia(COARSE_POINTER).matches;
const readHidden = () => document.visibilityState === 'hidden';
const readFalse = () => false;

function subscribeMedia(query, listener) {
  const media = window.matchMedia(query);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const subscribeReducedMotion = listener => subscribeMedia(REDUCED_MOTION, listener);
const subscribeCoarsePointer = listener => subscribeMedia(COARSE_POINTER, listener);
function subscribeVisibility(listener) {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}

// A child of .battle-map, never the scrolling viewport: terrain, tufts and cloud
// shadows therefore share the same camera and zoom, without a duplicate map image.
const BattleMapAtmosphere = memo(function BattleMapAtmosphere({ map, stageId, effectsEnabled = true, quality = 'auto' }) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, readFalse);
  const coarsePointer = useSyncExternalStore(subscribeCoarsePointer, readCoarsePointer, readFalse);
  const hidden = useSyncExternalStore(subscribeVisibility, readHidden, readFalse);
  const effectiveQuality = quality === 'low' || (quality === 'auto' && coarsePointer) ? 'low' : 'normal';
  const layout = useMemo(() => getMapAtmosphereLayout(map, stageId, effectiveQuality), [map, stageId, effectiveQuality]);
  if (!effectsEnabled || reducedMotion || (!layout.grass.length && !layout.clouds.length)) return null;

  return <div className="battle-map-atmosphere" aria-hidden="true" data-biome={layout.biome}
    data-quality={effectiveQuality} data-paused={String(hidden)}>
    {layout.clouds.map(cloud => <span key={`cloud-${cloud.index}`} className="battle-map-cloud-shadow"
      style={{ left: `${cloud.left}%`, top: `${cloud.top}%`, '--ambient-duration': `${cloud.duration}s`, '--ambient-delay': `${cloud.delay}s` }} />)}
    {layout.grass.map(tuft => <svg key={`${stageId}-${tuft.x}-${tuft.y}`} className={`battle-map-grass grass-variant-${tuft.variant}`}
      viewBox="0 0 30 24" focusable="false" data-map-grass-x={tuft.x} data-map-grass-y={tuft.y}
      style={{ left: `${tuft.left}%`, top: `${tuft.top}%`, '--ambient-duration': `${tuft.duration}s`, '--ambient-delay': `${tuft.delay}s` }}>
      <path className="grass-shadow" d="M8 23C6 17 5 14 1 10c6 2 8 6 10 10C10 11 11 6 14 1c-1 8 0 12 1 19 3-8 6-12 11-15-4 6-6 11-7 18Z" />
      <path className="grass-light" d="M11 23C9 17 7 15 4 14c4 0 7 2 10 7C14 14 15 10 18 6c-1 7-1 12-1 17 3-5 6-7 10-8-4 3-6 6-7 8Z" />
      <path className="grass-vein" d="M14 22c-1-7-1-12 0-18m3 18c2-6 4-9 7-13" />
    </svg>)}
  </div>;
});

export default BattleMapAtmosphere;
