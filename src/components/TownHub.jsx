import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ShoppingBag, BedDouble, Shield, Swords, DoorOpen, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, X } from 'lucide-react';
import { getPaintedVisualProfile } from '../data/unitVisuals.js';
import { getVillageWalkFrame, getVillageWalkFrames } from '../data/villageWalk.js';
import { getFacingArt } from '../engine/unitFacing.js';
import { TOWN_WIDTH, TOWN_HEIGHT, TOWN_ENTRANCE, TOWN_FACILITIES, TOWN_STEP_MS, getTownPath, advanceTownRoute, stopTownRoute, getTownStepDelay } from '../engine/townMovement.js';

const facilityIcons = { shop: ShoppingBag, inn: BedDouble, armory: Shield, training: Swords, gate: DoorOpen };

export default function TownHub({ party, onVisit, paused = false }) {
  const shell = useRef(null);
  const walkSprites = useRef(null);
  const [position, setPosition] = useState(TOWN_ENTRANCE);
  const [route, setRoute] = useState(null);
  const [walkerId, setWalkerId] = useState('hero');
  const [facing, setFacing] = useState(1);
  const [direction, setDirection] = useState('down');
  const [walkStep, setWalkStep] = useState(0);
  const [loadedWalker, setLoadedWalker] = useState(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const walker = party.find(unit => unit.id === walkerId) || party[0];
  const visualId = walker?.id;
  const walking = Boolean(route) && !paused;
  const idleArt = walker ? getPaintedVisualProfile(walker.id)?.map : null;
  const walkFrames = getVillageWalkFrames(visualId);
  const walkArtReady = loadedWalker === visualId;
  const walkArt = walking && walkArtReady && !reducedMotion ? getVillageWalkFrame(visualId, direction, walkStep) : null;
  useEffect(() => {
    if (!visualId) return;
    let cancelled = false;
    const frames = [...(walkSprites.current?.querySelectorAll('.town-walk-art, .town-preload-art') || [])];
    if (!frames.length) return;
    // Keep the decoded DOM images mounted: changing src every step can briefly blank a cached image.
    Promise.all(frames.map(image => image.decode()))
      .then(() => { if (!cancelled) setLoadedWalker(visualId); }).catch(() => {});
    return () => { cancelled = true; };
  }, [visualId]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = event => setReducedMotion(event.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!walking || reducedMotion) return;
    const timer = setInterval(() => setWalkStep(step => step + 1), TOWN_STEP_MS);
    return () => clearInterval(timer);
  }, [walking, reducedMotion]);
  const continueRoute = useEffectEvent(() => {
    if (paused) { setRoute(null); return; }
    const next = advanceTownRoute(position, route, performance.now());
    if (next.direction) {
      setDirection(next.direction);
      if (next.direction === 'left' || next.direction === 'right') setFacing(next.direction === 'left' ? -1 : 1);
    }
    setPosition(next.position);
    setRoute(next.route);
    if (next.arrived) onVisit(next.arrived);
  });
  useEffect(() => {
    if (!route) return;
    const timer = setTimeout(continueRoute, paused ? 0 : getTownStepDelay(route, performance.now()));
    return () => clearTimeout(timer);
  }, [route, paused]);
  const centerView = useEffectEvent((smooth = false) => {
    const element = shell.current;
    if (!element) return;
    const world = element.firstElementChild;
    if (!world) return;
    element.scrollTo({ left: (position.x + .5) / TOWN_WIDTH * world.clientWidth - element.clientWidth / 2,
      top: (position.y + .5) / TOWN_HEIGHT * world.clientHeight - element.clientHeight / 2,
      behavior: smooth ? 'smooth' : 'instant' });
  });
  useEffect(() => { centerView(walking && !reducedMotion); }, [position, walking, reducedMotion]);
  useEffect(() => {
    const element = shell.current;
    if (!element) return;
    let active = true;
    const observer = new ResizeObserver(() => { if (active) centerView(); });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }, []);
  const travel = (target, destination = null) => {
    if (paused) return;
    const path = getTownPath(position, target);
    if (!path.length) {
      if (position.x === target.x && position.y === target.y) {
        if (route) setRoute({ ...route, path: [], destination });
        else if (destination) onVisit(destination);
      }
      return;
    }
    // Finish the in-flight tile before changing course, so repeated taps cannot speed up travel.
    if (route) { setRoute({ ...route, path, destination }); return; }
    const next = advanceTownRoute(position, { path, destination }, performance.now());
    setDirection(next.direction);
    if (next.direction === 'left' || next.direction === 'right') setFacing(next.direction === 'left' ? -1 : 1);
    setPosition(next.position);
    setRoute(next.route);
  };
  const cancelTravel = () => setRoute(stopTownRoute);
  const step = (dx, dy) => {
    const target = { x: position.x + dx, y: position.y + dy };
    const path = getTownPath(position, target);
    if (path.length !== 1) return;
    travel(target, TOWN_FACILITIES.find(place => place.x === target.x && place.y === target.y)?.id);
  };
  const destination = TOWN_FACILITIES.find(place => place.id === route?.destination);
  return <section className="town-hub" aria-label="마을 광장">
    <nav className="town-destinations" aria-label="마을 시설">{TOWN_FACILITIES.map(place => {
      const Icon = facilityIcons[place.id];
      return <button key={place.id} onClick={() => travel(place, place.id)} aria-label={`${place.name}으로 이동`}><Icon size={18} />{place.name}</button>;
    })}</nav>
    <div className="town-map-shell" ref={shell} tabIndex={0} aria-label="마을 이동 지도" onKeyDown={event => {
      const direction = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }[event.key];
      if (direction) { event.preventDefault(); step(...direction); }
      if (event.key === 'Escape') cancelTravel();
    }}>
      <div className="town-world" onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        travel({ x: Math.floor((event.clientX - rect.left) / rect.width * TOWN_WIDTH), y: Math.floor((event.clientY - rect.top) / rect.height * TOWN_HEIGHT) });
      }}>
        <img className="town-background" src="/art/world-v2/scenes/village.webp" alt="상점과 여관, 장비점, 훈련소가 있는 마을" draggable="false" />
        {TOWN_FACILITIES.map(place => { const Icon = facilityIcons[place.id]; return <button key={place.id}
          className={`town-door town-door-${place.id}`} style={{ left: `${(place.x + .5) / TOWN_WIDTH * 100}%`, top: `${(place.y + .5) / TOWN_HEIGHT * 100}%` }}
          onClick={event => { event.stopPropagation(); travel(place, place.id); }}><Icon size={16} />{place.name}</button>; })}
        {route?.path.length > 0 && <span className="town-waypoint" style={{ left: `${(route.path.at(-1).x + .5) / TOWN_WIDTH * 100}%`, top: `${(route.path.at(-1).y + .5) / TOWN_HEIGHT * 100}%` }} />}
        {walker && <div ref={walkSprites} className={`town-walker ${walking ? 'is-walking' : ''} ${paused ? 'is-paused' : ''}`} data-town-x={position.x} data-town-y={position.y} data-town-direction={direction} data-walk-ready={walkArtReady} data-walk-frame={walkArt ? walkStep % 2 : 'idle'}
          style={{ left: `${(position.x + .5) / TOWN_WIDTH * 100}%`, top: `${(position.y + .5) / TOWN_HEIGHT * 100}%`, '--town-facing': facing, '--town-walk-facing': getFacingArt(direction).flip, '--town-step-duration': `${TOWN_STEP_MS}ms` }}>
          <img className={`town-idle-art ${walkArt ? 'has-walk-art' : ''}`} src={idleArt} alt={walker.name} draggable="false" />
          {walkFrames.map(src => <img key={src} className={src === walkArt ? 'town-walk-art' : 'town-preload-art'} src={src} alt="" aria-hidden="true" draggable="false" />)}
        </div>}
      </div>
    </div>
    <div className="town-controls">
      <label><span>이동 캐릭터</span><select aria-label="이동 캐릭터" value={walker?.id || ''} onChange={event => { cancelTravel(); if (event.target.value !== visualId) setLoadedWalker(null); setWalkerId(event.target.value); }}>{party.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <div className="town-dpad" role="group" aria-label="캐릭터 이동">{[[ArrowLeft, -1, 0, '왼쪽'], [ArrowUp, 0, -1, '위'], [ArrowDown, 0, 1, '아래'], [ArrowRight, 1, 0, '오른쪽']].map(([Icon, dx, dy, label]) =>
        <button key={label} title={label} aria-label={`${label} 이동`} onClick={() => step(dx, dy)}><Icon size={18} /></button>)}</div>
      {route && <button className="town-cancel" title="이동 취소" aria-label="마을 이동 취소" onClick={cancelTravel}><X size={18} /></button>}
    </div>
    <div className="town-location" role="status">{route ? `${destination?.name || '광장'}으로 이동 중` : '천수 마을 · 광장'}</div>
  </section>;
}
