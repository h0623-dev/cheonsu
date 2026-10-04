import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crosshair, MapPin, RotateCcw, Save, Swords, Users, X } from 'lucide-react';
import { getWorldScene, getWorldTileVisual } from '../data/worldArt.js';
import { getTerrainMoveCost, getTerrainMoveLabel, isTerrainBlocked } from '../engine/movement.js';
import './deployment-board.css';

const cellKey = ({ x, y }) => `${x},${y}`;
const EMPTY_MAP = [];
const TERRAIN_WARNINGS = {
  fire: '턴 시작 시 피해·화상', ice: '턴 시작 시 빙결',
  dark: '턴 시작 시 피해·출혈', rune: '턴 시작 시 피해·출혈',
  trap: '턴 시작 시 피해', swamp: '턴 시작 시 피해',
};

function terrainDescription(tile, unit) {
  if (tile == null) return '';
  if (isTerrainBlocked(tile)) return '이동할 수 없는 지형';
  const warning = TERRAIN_WARNINGS[tile] ? ` · ${TERRAIN_WARNINGS[tile]}` : '';
  return `${getTerrainMoveLabel(tile)} · 이동력 ${getTerrainMoveCost(tile, unit)} 사용${warning}`;
}

export default function DeploymentBoard({
  stage, units = [], roster = [], placedIds = [], placements = {}, validCells = [],
  selectedId = null, onSelect, onPlace, onRemove, onAutoPlace, onStart, onSave,
  ready = false, maxCount = 15, hint = '', getPortrait, getSprite, getTerrainStyle, getRole,
}) {
  const shellRef = useRef(null);
  const panRef = useRef(null);
  const panFrameRef = useRef(null);
  const suppressClickUntilRef = useRef(0);
  const [inspectedCell, setInspectedCell] = useState(null);
  const map = stage?.map || EMPTY_MAP;
  const rows = map.length;
  const columns = map[0]?.length || 0;
  const allowed = useMemo(() => new Set(validCells.map(cellKey)), [validCells]);
  const placed = useMemo(() => new Set(placedIds), [placedIds]);
  const occupants = useMemo(() => new Map(units.map(unit => [cellKey(unit), unit])), [units]);
  const selected = roster.find(unit => unit.id === selectedId) || null;
  const selectedPosition = selected && placed.has(selected.id)
    ? placements[selected.id] || units.find(unit => unit.id === selected.id && unit.type === 'ally')
    : null;
  const initialHero = units.find(unit => unit.id === 'hero' && unit.type === 'ally');
  const focusX = selectedPosition?.x ?? initialHero?.x ?? validCells[0]?.x;
  const focusY = selectedPosition?.y ?? initialHero?.y ?? validCells[0]?.y;
  const viewedCell = inspectedCell && map[inspectedCell.y]?.[inspectedCell.x] != null
    ? inspectedCell : selectedPosition;
  const viewedTerrain = viewedCell ? map[viewedCell.y]?.[viewedCell.x] : null;
  const terrain = useMemo(() => map.map((row, y) => row.map((tile, x) => {
    const visual = getWorldTileVisual(map, x, y, stage?.id || 1);
    return { ...visual, style: { ...getTerrainStyle?.(tile, x, y), ...visual.style } };
  })), [map, stage?.id, getTerrainStyle]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !Number.isFinite(focusX) || !Number.isFinite(focusY)) return;
    const center = () => {
      const cell = shell.querySelector(`[data-deployment-x="${focusX}"][data-deployment-y="${focusY}"]`);
      if (!cell) return;
      shell.scrollTo({
        left: Math.max(0, cell.offsetLeft + cell.offsetWidth / 2 - shell.clientWidth / 2),
        top: Math.max(0, cell.offsetTop + cell.offsetHeight / 2 - shell.clientHeight / 2),
        behavior: 'instant',
      });
    };
    const frame = requestAnimationFrame(center);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(center) : null;
    observer?.observe(shell);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [stage?.id, focusX, focusY]);

  useEffect(() => () => {
    if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    panFrameRef.current = null;
    panRef.current = null;
  }, []);

  const startPan = event => {
    if (event.button !== undefined && event.button !== 0) return;
    const shell = shellRef.current;
    if (!shell) return;
    if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    panFrameRef.current = null;
    panRef.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      left: shell.scrollLeft, top: shell.scrollTop, dragging: false,
    };
  };

  const movePan = event => {
    const pan = panRef.current;
    const shell = shellRef.current;
    if (!pan || !shell || pan.pointerId !== event.pointerId) return;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (!pan.dragging && Math.abs(dx) + Math.abs(dy) > 12) {
      pan.dragging = true;
      if (event.pointerType !== 'touch') {
        try { shell.setPointerCapture(event.pointerId); } catch { /* Older WebViews may lack pointer capture. */ }
      }
    }
    if (!pan.dragging || event.pointerType === 'touch') return;
    event.preventDefault();
    pan.nextLeft = pan.left - dx;
    pan.nextTop = pan.top - dy;
    if (panFrameRef.current === null) {
      panFrameRef.current = requestAnimationFrame(() => {
        panFrameRef.current = null;
        shell.scrollTo({ left: pan.nextLeft, top: pan.nextTop, behavior: 'instant' });
      });
    }
  };

  const endPan = event => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    panFrameRef.current = null;
    if (pan.dragging || event.type === 'pointercancel') {
      suppressClickUntilRef.current = performance.now() + 250;
      if (event.pointerType !== 'touch' && Number.isFinite(pan.nextLeft)) {
        shellRef.current?.scrollTo({ left: pan.nextLeft, top: pan.nextTop, behavior: 'instant' });
      }
    }
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Capture is optional. */ }
    panRef.current = null;
  };

  const chooseCell = (x, y, occupant) => {
    if (performance.now() < suppressClickUntilRef.current) return;
    setInspectedCell({ x, y });
    if (occupant?.type === 'ally' && !selectedId) onSelect?.(occupant.id);
    else onPlace?.({ x, y });
  };

  const navigateMap = event => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const current = event.target.closest('[data-deployment-x][data-deployment-y]');
    if (!direction || !current) return;
    event.preventDefault();
    let x = Number(current.dataset.deploymentX) + direction[0];
    let y = Number(current.dataset.deploymentY) + direction[1];
    while (x >= 0 && y >= 0 && x < columns && y < rows) {
      const next = shellRef.current?.querySelector(`[data-deployment-x="${x}"][data-deployment-y="${y}"]`);
      if (next && !next.disabled) { next.focus(); return; }
      x += direction[0]; y += direction[1];
    }
  };

  if (!rows || !columns) return null;

  return <section className="deployment-board" aria-label="전투 전 배치" lang="ko">
    <header className="deployment-board-heading">
      <div><span>전투 준비</span><h2><MapPin size={19} aria-hidden="true" /> 전투 배치</h2></div>
      <strong className="deployment-board-count"><Users size={17} aria-hidden="true" /> 배치 {placedIds.length} / {maxCount}</strong>
    </header>
    <p className="deployment-board-guide">캐릭터를 고른 뒤 파란 칸을 눌러 배치하세요.</p>
    <div className="deployment-board-layout">
      <div className="deployment-board-map-panel">
        <div className="deployment-board-map-caption"><span><i className="deployment-legend-ally" /> 배치 가능</span><span><i className="deployment-legend-enemy" /> 적군</span><small>지도를 밀어 다른 위치 보기</small></div>
        <div className="deployment-board-scroll" ref={shellRef} aria-label="배치 지도" onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onKeyDown={navigateMap}>
          <div className="deployment-board-grid" style={{ '--deployment-cols': columns, '--deployment-rows': rows, '--deployment-scene': `url("${getWorldScene(stage.id)}")` }}>
            {map.flatMap((row, y) => row.map((tile, x) => {
              const occupant = occupants.get(`${x},${y}`);
              const ally = occupant?.type === 'ally';
              const enemy = occupant && !ally;
              const blocked = isTerrainBlocked(tile);
              const valid = !blocked && !enemy && allowed.has(`${x},${y}`);
              const clickable = !blocked && !enemy && (valid || ally);
              const selectedCell = ally && occupant.id === selectedId;
              const warning = TERRAIN_WARNINGS[tile];
              const label = `배치칸 ${x + 1}/${y + 1} · ${valid ? '배치 가능' : enemy ? '적군 위치' : blocked ? '배치 불가' : '배치 구역 밖'}${occupant ? ` · ${occupant.name}` : ''}${warning ? ` · ${getTerrainMoveLabel(tile)} 주의` : ''}`;
              const visual = terrain[y][x];
              return <button type="button" key={`${x},${y}`} className={`deployment-board-cell ${valid ? 'is-valid' : 'is-outside'} ${blocked ? 'is-blocked' : ''} ${ally ? 'is-ally' : ''} ${enemy ? 'is-enemy' : ''} ${selectedCell ? 'is-selected' : ''}`} style={visual.style}
                data-deployment-x={x} data-deployment-y={y} data-deployment-valid={valid} data-deployment-unit={occupant?.id || ''} aria-label={label} aria-pressed={selectedCell} disabled={!clickable}
                title={`${label} · ${terrainDescription(tile, selected)}`} onClick={() => chooseCell(x, y, occupant)} onFocus={() => setInspectedCell({ x, y })}>
                <span className="deployment-cell-ground" aria-hidden="true" />
                {visual.prop && <img className={`deployment-cell-prop ${visual.blocked ? '' : 'is-low'}`} src={`/art/world-v2/props/${visual.prop}.webp`} alt="" aria-hidden="true" draggable="false" />}
                {valid && !occupant && <span className="deployment-cell-mark" aria-hidden="true">＋</span>}
                {warning && <span className="deployment-cell-warning" aria-hidden="true">!</span>}
                {occupant && <><img className="deployment-cell-sprite" src={getSprite?.(occupant)} alt={occupant.name} draggable="false" onError={event => { event.currentTarget.hidden = true; }} /><span className="deployment-cell-team" aria-hidden="true">{ally ? '아군' : occupant.type === 'boss' ? '보스' : '적군'}</span></>}
                {selectedCell && <span className="deployment-cell-selection" aria-hidden="true"><Crosshair size={18} /></span>}
              </button>;
            }))}
          </div>
        </div>
        <div className="deployment-board-selection">
          <div><strong>{selected ? `${selected.name} 선택` : '배치할 캐릭터를 선택하세요'}</strong><span>{selected ? `${getRole?.(selected) || '아군'} · ${selectedPosition ? `배치 위치 ${selectedPosition.x + 1}, ${selectedPosition.y + 1}` : '아직 배치하지 않음'}` : '보유 캐릭터 또는 지도 위 아군을 누르세요.'}</span></div>
          <button type="button" className="deployment-remove-btn" onClick={() => selected && onRemove?.(selected.id)} disabled={!selected || !placed.has(selected.id) || selected.id === 'hero'}><X size={15} aria-hidden="true" /> 배치 해제</button>
        </div>
        {viewedTerrain != null && <p className="deployment-board-terrain"><span>지형</span> {terrainDescription(viewedTerrain, selected)}</p>}
      </div>
      <div className="deployment-board-roster-panel">
        <div className="deployment-roster-heading"><h3>보유 캐릭터</h3><span>{roster.length}명<small className="deployment-roster-swipe-guide"> · 옆으로 넘겨 보기</small></span></div>
        <div className="deployment-board-roster" aria-label="보유 캐릭터 목록">
          {roster.map(unit => {
            const isPlaced = placed.has(unit.id);
            const isSelected = selectedId === unit.id;
            return <button type="button" key={unit.id} className={`deployment-roster-card ${isPlaced ? 'is-placed' : ''} ${isSelected ? 'is-selected' : ''}`} data-character-id={unit.id} data-placed={isPlaced} aria-pressed={isSelected} aria-label={`${unit.name} 배치 선택 · ${isPlaced ? '배치됨' : '대기'}${unit.id === 'hero' ? ' · 필수 출전' : ''}`} onClick={() => { setInspectedCell(null); onSelect?.(unit.id); }}>
              <span className="deployment-roster-face"><span aria-hidden="true">{unit.name?.slice(0, 1)}</span><img src={getPortrait?.(unit)} alt={unit.name} loading="lazy" onError={event => { event.currentTarget.hidden = true; }} /></span>
              <span className="deployment-roster-identity"><strong>{unit.name}{unit.id === 'hero' && <small>필수</small>}</strong><span>Lv.{unit.level || 1} · {getRole?.(unit) || '아군'}</span><em>{isPlaced ? '배치됨' : '대기'}</em></span>
              {isSelected && <Check className="deployment-roster-check" size={16} aria-hidden="true" />}
            </button>;
          })}
        </div>
      </div>
    </div>
    <p className="deployment-board-hint" role="status" aria-live="polite">{hint || '이미 배치한 캐릭터는 이동하거나 서로 자리를 바꿀 수 있습니다.'}</p>
    <p className="deployment-board-swap-guide">배치한 두 캐릭터의 자리를 바꾸려면 한 명을 선택한 뒤 다른 아군의 칸을 누르세요.</p>
    <div className="deployment-board-actions">
      <button type="button" onClick={onAutoPlace}><RotateCcw size={17} aria-hidden="true" /> 자동 배치</button>
      <button type="button" onClick={onSave}><Save size={17} aria-hidden="true" /> 배치 저장</button>
      <button type="button" className="deployment-start-btn" onClick={onStart} disabled={!ready}><Swords size={18} aria-hidden="true" /> 전투 시작</button>
    </div>
  </section>;
}
