import { useEffect, useMemo, useRef, useState } from 'react';
import { getPaintedVisualProfile } from '../data/unitVisuals.js';
import { getSkillPalette } from '../data/combatArt.js';
import { makeFieldBattlePlan } from '../engine/fieldBattlePlan.js';
import { loadFieldAssets } from '../engine/fieldBattleAssets.js';
import { createFieldRenderer } from '../engine/fieldBattleRenderer.js';
import './field-battle.css';

function Health({ unit, hp }) {
  return <div className={`field-health team-${unit.type === 'ally' ? 'ally' : 'enemy'}`}>
    <div><strong>{unit.name}</strong><span>{hp} / {unit.maxHp}</span></div>
    <div className="field-health-track"><i style={{ width: `${Math.max(0, hp) / Math.max(1, unit.maxHp) * 100}%` }} /></div>
  </div>;
}

export default function FieldBattleScene({ scene, attackerKey, defenderKey, effectsEnabled = true, shakeEnabled = true }) {
  const canvas = useRef(null), root = useRef(null);
  const plan = useMemo(() => makeFieldBattlePlan(scene, attackerKey, defenderKey), [scene, attackerKey, defenderKey]);
  const [impactedId, setImpactedId] = useState(null), [readyId, setReadyId] = useState(null);
  const impacted = impactedId === scene.id;
  useEffect(() => {
    let disposed = false, frame, renderer, timer, observer;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = media.matches;
    const updateMotion = () => { reduced = media.matches; };
    media.addEventListener('change', updateMotion);
    loadFieldAssets(plan).then(images => {
      if (disposed) return;
      const options = { effects: effectsEnabled, shake: shakeEnabled, reduced };
      renderer = createFieldRenderer(canvas.current, plan, images, options);
      const fit = () => { if (canvas.current) renderer.resize(canvas.current.clientWidth, canvas.current.clientHeight); };
      fit(); observer = new ResizeObserver(fit); observer.observe(canvas.current);
      const start = performance.now();
      const tick = now => {
        if (disposed) return;
        options.reduced = reduced;
        const fraction = Math.min(1, (now - start) / plan.duration);
        renderer.render(fraction);
        if (fraction < 1) frame = requestAnimationFrame(tick);
      };
      renderer.render(0); setReadyId(scene.id); frame = requestAnimationFrame(tick);
      timer = setTimeout(() => setImpactedId(scene.id), plan.duration * plan.impact);
    });
    return () => { disposed = true; cancelAnimationFrame(frame); clearTimeout(timer); observer?.disconnect(); renderer?.dispose(); media.removeEventListener('change', updateMotion); };
  }, [plan, scene.id, effectsEnabled, shakeEnabled]);
  const self = plan.source.id === plan.target.id;
  const result = plan.guarding ? '수호' : plan.healing ? `+${scene.outcome.damage}` : plan.miss ? '회피' : String(scene.outcome.damage);
  return <section ref={root} className={`field-battle-scene ${plan.skill ? 'is-skill' : 'is-basic'} ${plan.support ? 'is-support' : ''} ${plan.miss ? 'is-miss' : ''}`}
    data-motion={plan.motion} data-unit-key={attackerKey} data-ready={readyId === scene.id} data-self={self} data-impact={plan.impact} data-presentation={plan.skill ? 'skill' : 'attack'} aria-label={`${scene.attacker.name} ${plan.skill ? plan.name : scene.title}`} role="status"
    style={{ '--field-color': getSkillPalette(plan.effect), '--field-duration': `${plan.duration}ms` }}>
    <canvas ref={canvas} className="field-battle-canvas" aria-label="전장 전투 연출" />
    <header className="field-battle-heading"><span>{scene.attacker.type === 'ally' ? '아군' : scene.attacker.type === 'boss' ? '적장' : '적군'} · {scene.attacker.name}</span>
      <h2>{plan.skill ? plan.name : scene.mode === 'counter' ? '반격' : '일반 공격'}</h2>
      <small>{scene.outcome.crit ? '치명타' : scene.finish ? '결정타' : ''}</small></header>
    {plan.skill && <div className="field-skill-banner" aria-hidden="true">
      <img src={getPaintedVisualProfile(attackerKey)?.portrait} alt="" /><div><small>{scene.attacker.name}</small><strong>{plan.name}</strong></div>
    </div>}
    {impacted && <div className="field-battle-result"><small>{scene.outcome.crit ? '치명타' : plan.miss ? '' : plan.support ? '' : '피해'}</small><strong>{result}</strong></div>}
    <footer className="field-battle-health">
      <Health unit={scene.attacker} hp={impacted && self ? scene.defenderPostHp ?? scene.attacker.hp : scene.attacker.hp} />
      {!self && <Health unit={scene.defender} hp={impacted ? scene.defenderPostHp ?? scene.defender.hp : scene.defender.hp} />}
    </footer>
  </section>;
}
