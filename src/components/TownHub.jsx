import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ShoppingBag, BedDouble, Shield, Swords, DoorOpen, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, X } from 'lucide-react';
import { getPaintedVisualProfile } from '../data/unitVisuals.js';
import { TOWN_WIDTH, TOWN_HEIGHT, TOWN_ENTRANCE, TOWN_FACILITIES, getTownPath } from '../engine/townMovement.js';

const facilityIcons = { shop: ShoppingBag, inn: BedDouble, armory: Shield, training: Swords, gate: DoorOpen };

export default function TownHub({ party, onVisit }) {
  const shell = useRef(null);
  const [position, setPosition] = useState(TOWN_ENTRANCE);
  const [route, setRoute] = useState(null);
  const [walkerId, setWalkerId] = useState('hero');
  const [facing, setFacing] = useState(1);
  const walker = party.find(unit => unit.id === walkerId) || party[0];
  const arrive = useEffectEvent(id => { if (id) onVisit(id); });
  useEffect(() => {
    if (!route) return;
    const timer = setTimeout(() => {
      if (!route.path.length) { setRoute(null); arrive(route.destination); return; }
      const [next, ...remaining] = route.path;
      if (next.x !== position.x) setFacing(Math.sign(next.x - position.x));
      setPosition(next);
      setRoute({ ...route, path: remaining });
    }, 100);
    return () => clearTimeout(timer);
  }, [route, position.x]);
  useEffect(() => {
    const element = shell.current;
    const center = () => {
      const world = element.firstElementChild;
      element.scrollTo({ left: (position.x + .5) / TOWN_WIDTH * world.clientWidth - element.clientWidth / 2,
        top: (position.y + .5) / TOWN_HEIGHT * world.clientHeight - element.clientHeight / 2 });
    };
    center();
    const observer = new ResizeObserver(center);
    observer.observe(element);
    return () => observer.disconnect();
  }, [position]);
  const travel = (target, destination = null) => {
    const path = getTownPath(position, target);
    if (!path.length) {
      if (position.x === target.x && position.y === target.y && destination) onVisit(destination);
      return;
    }
    setRoute({ path, destination });
  };
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
      if (event.key === 'Escape') setRoute(null);
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
        {walker && <div className={`town-walker ${route ? 'is-walking' : ''}`} data-town-x={position.x} data-town-y={position.y}
          style={{ left: `${(position.x + .5) / TOWN_WIDTH * 100}%`, top: `${(position.y + .5) / TOWN_HEIGHT * 100}%`, '--town-facing': facing }}>
          <img src={getPaintedVisualProfile(walker.id).map} alt={walker.name} draggable="false" />
        </div>}
      </div>
    </div>
    <div className="town-controls">
      <label><span>이동 캐릭터</span><select aria-label="이동 캐릭터" value={walker?.id || ''} onChange={event => setWalkerId(event.target.value)}>{party.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <div className="town-dpad" role="group" aria-label="캐릭터 이동">{[[ArrowLeft, -1, 0, '왼쪽'], [ArrowUp, 0, -1, '위'], [ArrowDown, 0, 1, '아래'], [ArrowRight, 1, 0, '오른쪽']].map(([Icon, dx, dy, label]) =>
        <button key={label} title={label} aria-label={`${label} 이동`} onClick={() => step(dx, dy)}><Icon size={18} /></button>)}</div>
      {route && <button className="town-cancel" title="이동 취소" aria-label="마을 이동 취소" onClick={() => setRoute(null)}><X size={18} /></button>}
    </div>
    <div className="town-location" role="status">{route ? `${destination?.name || '광장'}으로 이동 중` : '천수 마을 · 광장'}</div>
  </section>;
}
