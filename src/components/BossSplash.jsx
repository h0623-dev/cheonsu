import { useState } from 'react';
import { getBossSplash } from '../data/bossArt.js';
import './boss-splash.css';

export default function BossSplash({ scene, fallbackSrc, effectsEnabled = true }) {
  const art = getBossSplash(scene.boss);
  const [failed, setFailed] = useState(false);
  const awakened = scene.type === 'phase2';
  return <div className={`boss-splash-overlay ${awakened ? 'is-awakened' : ''} ${effectsEnabled ? '' : 'is-still'}`}
    style={{ '--boss-accent': art.accent }} data-boss-art={art.key} role="status" aria-live="polite">
    <section className="boss-splash" aria-label={scene.title}>
      <img className={`boss-splash-art ${failed ? 'is-fallback' : ''}`} src={failed ? fallbackSrc : art.src}
        alt={scene.boss.name} decoding="sync" fetchPriority="high" draggable="false"
        onError={() => { if (!failed) setFailed(true); }} />
      <div className="boss-splash-shade" aria-hidden="true" />
      <div className="boss-splash-heading"><span />{awakened ? '각성 · 두 번째 전투' : '적 지휘관 등장'}<span /></div>
      <div className="boss-splash-caption">
        <p className="boss-splash-kicker">{awakened ? '한계를 넘어선 힘' : '강적과의 조우'}</p>
        <h2>{scene.boss.name}</h2>
        <p className="boss-splash-description">{scene.subtitle}</p>
        <dl className="boss-splash-stats">
          <div><dt>체력</dt><dd>{scene.boss.hp}<small> / {scene.boss.maxHp}</small></dd></div>
          <div><dt>공격</dt><dd>{scene.boss.atk}</dd></div>
          <div><dt>방어</dt><dd>{scene.boss.def}</dd></div>
        </dl>
      </div>
    </section>
  </div>;
}
