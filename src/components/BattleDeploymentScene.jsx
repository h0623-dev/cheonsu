import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Crosshair, Flag, MapPin, RotateCcw, Save, Swords, Users, X } from 'lucide-react';
import './BattleDeploymentScene.css';

const ZOOM_OPTIONS = [
  { id: 'fit', label: '전체' },
  { id: 'normal', label: '표준' },
  { id: 'large', label: '확대' },
];

export default function BattleDeploymentScene({
  stage, roster = [], placedIds = [], placements = {}, selectedId = null,
  onSelect, onRemove, onAutoPlace, onStart, onSave, onExit, onMission, onManage,
  ready = false, busy = false, maxCount = 15, validCellCount = 0, hint = '',
  getPortrait, getRole, children,
}) {
  const viewportRef = useRef(null);
  const rosterRef = useRef(null);
  const panRef = useRef(null);
  const panFrameRef = useRef(null);
  const suppressClickUntilRef = useRef(0);
  const [zoom, setZoom] = useState('normal');
  const placed = useMemo(() => new Set(placedIds), [placedIds]);
  const selected = roster.find(unit => unit.id === selectedId) || null;
  const selectedPosition = selected && placed.has(selected.id) ? placements[selected.id] : null;
  const focusPosition = selectedPosition || placements.hero;
  const focusX = focusPosition?.x;
  const focusY = focusPosition?.y;
  const rows = stage?.map?.length || 0;
  const columns = stage?.map?.[0]?.length || 0;

  const focusMap = useCallback((region = false) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const cell = !region && Number.isFinite(focusX) && Number.isFinite(focusY)
      ? viewport.querySelector(`[data-map-x="${focusX}"][data-map-y="${focusY}"]`)
      : null;
    const cells = cell ? [cell] : [...viewport.querySelectorAll('[data-deployment-valid="true"]')];
    if (!cells.length) return;
    const bounds = cells.map(element => element.getBoundingClientRect());
    const viewportBounds = viewport.getBoundingClientRect();
    const centerX = (Math.min(...bounds.map(rect => rect.left)) + Math.max(...bounds.map(rect => rect.right))) / 2;
    const centerY = (Math.min(...bounds.map(rect => rect.top)) + Math.max(...bounds.map(rect => rect.bottom))) / 2;
    viewport.scrollTo({
      left: Math.max(0, viewport.scrollLeft + centerX - viewportBounds.left - viewport.clientLeft - viewport.clientWidth / 2),
      top: Math.max(0, viewport.scrollTop + centerY - viewportBounds.top - viewport.clientTop - viewport.clientHeight / 2),
      behavior: 'instant',
    });
  }, [focusX, focusY]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let frame = null;
    const resize = () => {
      viewport.style.setProperty('--deployment-view-width', `${viewport.clientWidth}px`);
      viewport.style.setProperty('--deployment-view-height', `${viewport.clientHeight}px`);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        focusMap(zoom === 'fit');
      });
    };
    resize();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(viewport);
    window.addEventListener('resize', resize);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [stage?.id, focusMap, zoom]);

  useEffect(() => {
    const strip = rosterRef.current;
    const button = strip && [...strip.querySelectorAll('[data-character-id]')]
      .find(element => element.dataset.characterId === selectedId);
    if (!button) return;
    const bounds = button.getBoundingClientRect();
    const stripBounds = strip.getBoundingClientRect();
    if (bounds.left < stripBounds.left || bounds.right > stripBounds.right) {
      strip.scrollTo({ left: strip.scrollLeft + bounds.left - stripBounds.left - (strip.clientWidth - bounds.width) / 2, behavior: 'instant' });
    }
  }, [selectedId]);

  useEffect(() => () => {
    if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    panRef.current = null;
  }, []);

  const beginPan = event => {
    if (busy || (event.button !== undefined && event.button !== 0)) return;
    const viewport = viewportRef.current;
    if (!viewport || panRef.current) return;
    panRef.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      left: viewport.scrollLeft, top: viewport.scrollTop, dragging: false,
    };
  };

  const movePan = event => {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport || event.pointerId !== pan.pointerId) return;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (!pan.dragging && Math.abs(dx) + Math.abs(dy) > 10) {
      pan.dragging = true;
      viewport.classList.add('is-panning');
      if (event.pointerType !== 'touch') {
        try { viewport.setPointerCapture(event.pointerId); } catch { /* 포인터 캡처 미지원 환경에서는 기본 스크롤을 사용합니다. */ }
      }
    }
    if (!pan.dragging || event.pointerType === 'touch') return;
    event.preventDefault();
    pan.nextLeft = pan.left - dx;
    pan.nextTop = pan.top - dy;
    if (panFrameRef.current === null) {
      panFrameRef.current = requestAnimationFrame(() => {
        panFrameRef.current = null;
        viewport.scrollTo({ left: pan.nextLeft, top: pan.nextTop, behavior: 'instant' });
      });
    }
  };

  const endPan = event => {
    const pan = panRef.current;
    if (!pan || event.pointerId !== pan.pointerId) return;
    if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    panFrameRef.current = null;
    if (pan.dragging || event.type === 'pointercancel') {
      suppressClickUntilRef.current = performance.now() + 350;
      if (event.pointerType !== 'touch' && Number.isFinite(pan.nextLeft)) {
        viewportRef.current?.scrollTo({ left: pan.nextLeft, top: pan.nextTop, behavior: 'instant' });
      }
    }
    viewportRef.current?.classList.remove('is-panning');
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* 캡처를 시작하지 않은 포인터도 정리합니다. */ }
    panRef.current = null;
  };

  const captureMapClick = event => {
    if (busy || (event.detail !== 0 && performance.now() < suppressClickUntilRef.current)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const navigateMap = event => {
    if (busy) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    const viewport = viewportRef.current;
    const current = event.target.closest('[data-map-x][data-map-y]');
    event.preventDefault();
    event.stopPropagation();
    if (!current) {
      viewport?.scrollBy({ left: direction[0] * 80, top: direction[1] * 80, behavior: 'instant' });
      return;
    }
    let x = Number(current.dataset.mapX) + direction[0];
    let y = Number(current.dataset.mapY) + direction[1];
    while (x >= 0 && y >= 0 && x < columns && y < rows) {
      const next = viewport?.querySelector(`[data-map-x="${x}"][data-map-y="${y}"]`);
      if (next && next.tabIndex >= 0 && !next.disabled && next.getAttribute('aria-disabled') !== 'true') {
        next.focus();
        return;
      }
      x += direction[0];
      y += direction[1];
    }
  };

  return <section className="deployment-screen battle-screen battle-final-concept battle-board-only battle-deployment-scene" aria-label="전장 배치" aria-busy={busy} lang="ko">
    <header className="battle-deploy-header">
      <button type="button" className="battle-deploy-icon-button" onClick={onExit} disabled={busy} aria-label="전장 배치를 나가고 원정 지도로 돌아가기" title="원정 지도로 돌아가기"><ArrowLeft size={20} aria-hidden="true" /></button>
      <div className="battle-deploy-title"><h1>{stage?.id}장 · {stage?.title || stage?.name || '전장'}</h1><p>전장 배치 <span>출전 {placedIds.length} / {maxCount}명 · 지정 {validCellCount}칸</span></p></div>
      <button type="button" className="battle-deploy-header-button" onClick={onMission} disabled={busy}><Flag size={16} aria-hidden="true" /><span>미션</span></button>
      {onManage && <button type="button" className="battle-deploy-header-button" onClick={onManage} disabled={busy}><Users size={16} aria-hidden="true" /><span>편성</span></button>}
    </header>

    <main className="battle-deploy-map-panel" aria-label="실제 전장과 배치 구역">
      <div className="battle-deploy-map-tools">
        <div className="battle-deploy-zoom" role="group" aria-label="전장 크기">
          {ZOOM_OPTIONS.map(option => <button type="button" key={option.id} aria-pressed={zoom === option.id} disabled={busy} onClick={() => setZoom(option.id)}>{option.label}</button>)}
        </div>
        <div className="battle-deploy-focus" role="group" aria-label="지도 위치 이동">
          <button type="button" onClick={() => focusMap(true)} disabled={busy}><MapPin size={15} aria-hidden="true" />배치 구역</button>
          <button type="button" onClick={() => focusMap(false)} disabled={busy || !selectedPosition} aria-label={selected ? `${selected.name}의 배치 위치 보기` : '선택 아군 위치 보기'}><Crosshair size={15} aria-hidden="true" />선택 아군</button>
        </div>
      </div>
      <p className="battle-deploy-map-guide" id="battle-deploy-map-guide"><span><i aria-hidden="true" />파란 칸만 배치 가능</span><span>지도를 밀어 둘러보기</span></p>
      <div ref={viewportRef} className={`deployment-board battle-map-scroll-shell battle-deploy-viewport map-zoom-${zoom}`} role="region" aria-label="전장 배치 지도" aria-describedby="battle-deploy-map-guide" tabIndex={0}
        onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan}
        onPointerLeave={event => { if (event.pointerType !== 'touch' && !event.currentTarget.hasPointerCapture?.(event.pointerId)) endPan(event); }}
        onClickCapture={captureMapClick} onKeyDownCapture={navigateMap} onDragStart={event => event.preventDefault()}>
        <div className="battle-deploy-map-plane">{children}</div>
      </div>
    </main>

    <footer className="battle-deploy-footer">
      <div className="battle-deploy-selection">
        <div><strong>{selected ? `${selected.name} 선택` : '배치할 아군을 선택하세요'}</strong><span>{selectedPosition ? `${getRole?.(selected) || '아군'} · ${selectedPosition.x + 1}, ${selectedPosition.y + 1}에 배치됨` : selected ? `${getRole?.(selected) || '아군'} · 파란 칸을 눌러 배치` : '아래 보유 캐릭터를 누르세요'}</span></div>
        <button type="button" onClick={() => selected && onRemove?.(selected.id)} disabled={busy || !selected || !placed.has(selected.id) || selected.id === 'hero'} aria-label={selected?.id === 'hero' ? '주인공은 필수 출전으로 배치를 해제할 수 없습니다' : '선택 아군 배치 해제'}><X size={15} aria-hidden="true" />배치 해제</button>
      </div>
      <div className="battle-deploy-roster-panel">
        <div className="battle-deploy-roster-heading"><h2>보유 캐릭터 <span>{roster.length}명</span></h2><span>옆으로 넘겨 보기</span></div>
        <div className="battle-deploy-roster" ref={rosterRef} aria-label="보유 캐릭터 목록">
          {roster.map(unit => {
            const isPlaced = placed.has(unit.id);
            const isSelected = unit.id === selectedId;
            const portrait = getPortrait?.(unit);
            return <button type="button" key={unit.id} className={`deployment-roster-card battle-deploy-roster-card${isPlaced ? ' is-placed' : ''}${isSelected ? ' is-selected' : ''}`} data-character-id={unit.id} data-placed={isPlaced} aria-pressed={isSelected} disabled={busy} aria-label={`${unit.name} 배치 선택 · ${isPlaced ? '배치됨' : '대기'}${unit.id === 'hero' ? ' · 필수 출전' : ''}`} onClick={() => onSelect?.(unit.id)}>
              <span className="battle-deploy-face"><span aria-hidden="true">{unit.name?.slice(0, 1)}</span>{portrait && <img src={portrait} alt="" loading="lazy" draggable="false" onError={event => { event.currentTarget.hidden = true; }} />}</span>
              <span className="battle-deploy-identity"><strong>{unit.name}{unit.id === 'hero' && <small>필수</small>}</strong><span>Lv.{unit.level || 1} · {getRole?.(unit) || '아군'}</span><em>{isPlaced ? '배치됨' : '대기'}</em></span>
              {isSelected && <Check className="battle-deploy-selected-mark" size={14} aria-hidden="true" />}
            </button>;
          })}
        </div>
      </div>
      <p className="battle-deploy-hint" role="status" aria-live="polite" aria-atomic="true">{busy ? '전장 안내가 끝나면 아군을 배치할 수 있습니다.' : hint || '아군을 고른 뒤 파란 칸을 누르세요. 다른 아군의 칸을 누르면 서로 자리를 바꿉니다.'}</p>
      <div className="battle-deploy-actions">
        <button type="button" onClick={onAutoPlace} disabled={busy}><RotateCcw size={16} aria-hidden="true" />자동 배치</button>
        <button type="button" onClick={onSave} disabled={busy}><Save size={16} aria-hidden="true" />배치 저장</button>
        <button type="button" className="deployment-start-btn battle-deploy-start" onClick={onStart} disabled={busy || !ready}><Swords size={17} aria-hidden="true" /><span>배치 완료<small>전투 개시</small></span></button>
      </div>
    </footer>
  </section>;
}
