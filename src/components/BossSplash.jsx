import { useEffect, useId, useRef, useState } from 'react';
import { getBossSplash } from '../data/bossArt.js';
import { getBossPresentation } from '../data/bossPresentation.js';
import './boss-splash.css';

export default function BossSplash({ scene, fallbackSrc, effectsEnabled = true, onDismiss }) {
  const stage = scene.stage ?? scene.stageId;
  const presentation = scene.presentation ?? getBossPresentation(stage, scene.boss);
  const art = getBossSplash(scene.boss, stage);
  const awakened = scene.type === 'phase2';
  const phase = awakened ? presentation.phase : null;
  const title = `${scene.boss.name}${awakened ? ' · 각성' : ''}`;
  const epithet = phase?.title || presentation.epithet || presentation.title;
  const quote = phase?.quote || presentation.quote;
  const threat = phase?.threat || presentation.threat || scene.subtitle;
  const headingId = useId();
  const descriptionId = useId();
  const overlayRef = useRef(null);
  const dismissRef = useRef(null);
  const [failedSources, setFailedSources] = useState([]);
  const imageSources = [...new Set([art.bodySrc, art.src, fallbackSrc].filter(Boolean))];
  const imageSrc = imageSources.find(src => !failedSources.includes(src));
  const usingFallback = imageSrc !== imageSources[0];
  const phaseLabel = phase?.label || '두 번째 격돌';

  useEffect(() => {
    const previousFocus = document.activeElement;
    const overlay = overlayRef.current;
    (dismissRef.current || overlay)?.focus({ preventScroll: true });
    return () => {
      // Automatic dismissal must return keyboard control to the battlefield.
      if (previousFocus?.isConnected && (overlay?.contains(document.activeElement) || document.activeElement === document.body)) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [scene.id]);

  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onDismiss?.();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      (dismissRef.current || overlayRef.current)?.focus({ preventScroll: true });
    }
  };

  return <div ref={overlayRef}
    className={`boss-splash-overlay ${awakened ? 'is-awakened' : ''} ${effectsEnabled ? '' : 'is-still'}`}
    style={{ '--boss-accent': presentation.accent || art.accent }}
    data-boss-art={art.key} data-boss-stage={presentation.stageId} data-boss-tone={presentation.tone}
    role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={descriptionId}
    tabIndex={-1} onKeyDown={handleKeyDown}>
    <section className="boss-splash" aria-label={scene.title || title}>
      {art.backdrop && <div className="boss-splash-backdrop" aria-hidden="true"
        style={{ backgroundImage: `url("${art.backdrop}")` }} />}
      <div className="boss-splash-shade" aria-hidden="true" />
      <div className="boss-splash-heading">
        <p className="boss-splash-rank"><span aria-hidden="true" />{awakened ? phaseLabel : presentation.rankLabel || '적 지휘관 등장'}</p>
        <p className="boss-splash-stage">
          {presentation.stageId ? <span>제 {presentation.stageId}장</span> : null}
          <span>{presentation.arenaLabel || presentation.stageTitle}</span>
        </p>
      </div>
      <div className="boss-splash-scene">
        <div className="boss-splash-figure">
          <div className="boss-splash-body">
            <div className="boss-splash-backlight" aria-hidden="true" />
            <div className="boss-splash-ground" aria-hidden="true" />
            {imageSrc ? <img className={`boss-splash-art ${usingFallback ? 'is-fallback' : ''}`}
              style={{ '--boss-body-scale': imageSrc === art.bodySrc ? art.bodyScale ?? 1 : 1,
                '--boss-body-offset': imageSrc === art.bodySrc ? art.bodyOffset ?? '0%' : '0%' }}
              src={imageSrc} alt={`${scene.boss.name}의 전신`} decoding="sync" fetchPriority="high" draggable="false"
              onError={() => setFailedSources(sources => sources.includes(imageSrc) ? sources : [...sources, imageSrc])} />
              : <div className="boss-splash-sigil" aria-hidden="true">◆</div>}
            <div className="boss-splash-motes" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          </div>
          {presentation.atmosphere && <p className="boss-splash-atmosphere">{presentation.atmosphere}</p>}
        </div>
        <div className="boss-splash-caption">
          <p className="boss-splash-kicker">{epithet || (awakened ? '멈추지 않는 위협' : '전장을 지배하는 자')}</p>
          <h2 id={headingId}>{title}</h2>
          <div className="boss-splash-rule" aria-hidden="true"><span /></div>
          {quote && <blockquote className="boss-splash-quote">“{quote}”</blockquote>}
          <div className="boss-splash-warning" id={descriptionId}>
            <span className="boss-splash-warning-mark" aria-hidden="true">!</span>
            <div><p className="boss-splash-warning-label">{awakened ? '변화한 전황' : '주요 위협'}</p>
              <p className="boss-splash-description">{threat}</p></div>
          </div>
        </div>
      </div>
      <footer className="boss-splash-footer">
        <dl className="boss-splash-stats"><div><dt>적장 체력</dt>
          <dd>{scene.boss.hp}<span> / {scene.boss.maxHp}</span></dd></div></dl>
        <button ref={dismissRef} type="button" className="boss-splash-dismiss" onClick={onDismiss}>
          전장으로 <span aria-hidden="true">→</span>
        </button>
      </footer>
    </section>
  </div>;
}
