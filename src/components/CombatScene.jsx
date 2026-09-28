import { useEffect, useState, useMemo, useRef } from 'react';
import { getCombatMotionSprite, getCombatPresentation, getCombatFrameStyle, getCombatTiming, getSkillPalette, getCombatSprite, getCombatChoreography } from '../data/combatArt.js';
import { getPaintedVisualProfile } from '../data/unitVisuals.js';
import { useDuelAnimation } from '../engine/useDuelAnimation.js';
import DuelEffects from './DuelEffects.jsx';
import './skill-presentation.css';

const weaponLabels = { slash: '검', thrust: '창', heavy: '중병기', guard: '방패', quick: '단검', beast: '야수', whip: '채찍', fist: '권격', bow: '활', cannon: '포격', cast: '마법' };

function getWeaponMotion(unitKey) {
  // An elemental skill keeps the footwork of the weapon drawn in the sprite.
  const weapon = getCombatPresentation(unitKey, { outcome: { hit: true } });
  if (weapon.style === 'cast') return 'cast';
  if (weapon.style === 'ranged') return weapon.effect === 'impact' ? 'cannon' : 'bow';
  if (unitKey === 'void_knight' || unitKey === 'boss_abyss') return 'slash';
  if (unitKey === 'beast_tamer') return 'whip';
  return { thrust: 'thrust', heavy: 'heavy', guard: 'guard', shadow: 'quick', claw: 'beast', impact: 'fist' }[weapon.effect] || 'slash';
}

function FighterPoses({ unitKey, name, defender = false, skillPose }) {
  const poses = defender ? ['ready', 'recoil', 'evade'] : ['ready', 'run-a', 'run-b', 'windup', 'strike', 'recover'];
  return <div className="fighter-body"><div className="fighter-poses">
    {poses.map(pose => <img key={pose} data-pose={pose}
      className={`fighter-frame fighter-${pose}${pose === 'strike' ? ' fighter-action' : ''}`}
      style={getCombatFrameStyle(unitKey, pose === 'ready' ? 'recover' : pose === 'evade' ? 'run-a' : pose)}
      src={getCombatMotionSprite(unitKey, pose === 'ready' ? 'recover' : pose === 'evade' ? 'run-a' : pose)}
      alt={pose === 'ready' ? name : ''} draggable="false" />)}
    {skillPose&&<img data-pose="skill" className="fighter-frame fighter-skill" src={skillPose.src} alt="" draggable="false" style={{'--combat-sprite-scale':skillPose.scale,'--combat-foot-offset':'0%'}}/>}
  </div></div>;
}

function Health({ unit, hp }) {
  const percent = Math.max(0, Math.min(100, hp / Math.max(1, unit.maxHp) * 100));
  return <div className={`combat-health team-${unit.type === 'ally' ? 'ally' : 'enemy'}`}>
    <div><strong>{unit.name}</strong><span>{hp} / {unit.maxHp}</span></div>
    <div className="combat-health-track"><i style={{ width: `${percent}%` }} /></div>
  </div>;
}

export default function CombatScene({ scene, attackerKey, defenderKey, background, effectsEnabled = true, shakeEnabled = true }) {
  const root=useRef(null);
  const plan=useMemo(()=>getCombatChoreography(attackerKey,scene),[attackerKey,scene]);
  const [impactedScene, setImpactedScene] = useState(null);
  const impacted = impactedScene === scene;
  const duration = scene.durationMs || 1800;
  const presentation = getCombatPresentation(attackerKey, scene);
  const timing = getCombatTiming(scene);
  const weaponMotion = presentation.support ? 'cast' : getWeaponMotion(attackerKey);
  const selfSupport = presentation.support && scene.attacker.id && scene.attacker.id === scene.defender.id;
  useDuelAnimation(root,plan,duration,{enabled:effectsEnabled,shake:shakeEnabled,miss:presentation.miss,support:presentation.support,finish:scene.finish,selfSupport});
  const enemy = ['enemy', 'boss'].includes(scene.attacker.type)
    ? { unit: scene.attacker, key: attackerKey, side: 'attacker' }
    : ['enemy', 'boss'].includes(scene.defender.type) && !selfSupport
      ? { unit: scene.defender, key: defenderKey, side: 'defender' } : null;
  useEffect(() => {
    const timer = setTimeout(() => setImpactedScene(scene), duration * timing.impact);
    return () => clearTimeout(timer);
  }, [duration, scene, timing.impact]);
  const result = presentation.guarding ? '수호' : presentation.healing ? `+${scene.outcome.damage}` : presentation.miss ? '회피' : `${scene.outcome.damage}`;
  return <div className="painted-combat-overlay" role="status" aria-label={`${scene.attacker.name} ${scene.title}`}>
    <section ref={root} key={scene.id} data-choreography={plan.id} data-motion={plan.motion} data-presentation={timing.skill ? 'skill' : 'attack'} data-impact={timing.impact} className={`painted-combat duel-choreographed motion-${presentation.style} weapon-${weaponMotion} element-${presentation.effect} ${timing.skill ? 'is-skill' : 'is-basic'} ${shakeEnabled ? 'shake-enabled' : ''} ${enemy?.unit.type === 'boss' ? 'has-boss' : ''} ${presentation.support ? 'is-support' : ''} ${selfSupport ? 'is-self-support' : ''} ${presentation.healing ? 'is-healing' : ''} ${presentation.guarding ? 'is-guarding' : ''} ${presentation.miss ? 'is-miss' : ''} ${scene.finish ? 'is-finish' : ''} ${!effectsEnabled ? 'motion-off' : ''}`}
      style={{ '--combat-duration': `${duration}ms`, '--combat-action-duration': `${duration * timing.action}ms`, '--combat-lead': `${duration * timing.lead}ms`, '--skill-color': getSkillPalette(presentation.effect), '--combat-scene': `url("${background}")` }}>
      <header className="painted-combat-heading"><span>{scene.attacker.name}</span><h2>{timing.skill ? plan.name : scene.title}</h2><span>{scene.outcome?.crit ? '치명타' : scene.finish ? '결정타' : scene.effectLabel}</span></header>
      <div className="painted-combat-arena">
        {timing.skill && <>
          <div className="skill-stage-shade" aria-hidden="true" />
          <div className="skill-cut-in" aria-hidden="true">
            <img src={getPaintedVisualProfile(attackerKey)?.portrait || getCombatSprite(attackerKey)} alt="" />
            <div><small>{presentation.healing ? '회복술' : presentation.guarding ? '수호술' : presentation.style === 'cast' ? '마법 발동' : '고유 기술'}</small><strong>{plan.name}</strong></div>
          </div>
        </>}
        <DuelEffects plan={plan} unitKey={attackerKey}/>
        {enemy && <aside className={`combat-enemy-intro intro-${enemy.side}`} aria-label={`${enemy.unit.type === 'boss' ? '적장' : '적군'} ${enemy.unit.name}`}>
          <span>{enemy.unit.type === 'boss' ? '적장' : '적군'} · {weaponLabels[getWeaponMotion(enemy.key)]}</span>
          <strong>{enemy.unit.name}</strong>
        </aside>}
        <div className="painted-fighter fighter-attacker">
          <div className="fighter-shadow" />
          <FighterPoses unitKey={attackerKey} name={scene.attacker.name} skillPose={plan.skillPose} />
        </div>
        {!selfSupport && <div className="painted-fighter fighter-defender">
          <div className="fighter-shadow" />
          <FighterPoses unitKey={defenderKey} name={scene.defender.name} defender />
        </div>}
        <div className="combat-result"><small>{scene.outcome?.crit ? 'CRITICAL' : presentation.guarding ? 'GUARD' : presentation.healing ? 'HEAL' : scene.finish ? 'FINISH' : ''}</small><strong>{result}</strong></div>
      </div>
      <footer className="painted-combat-health">
        <Health unit={scene.attacker} hp={impacted ? (selfSupport ? scene.defenderPostHp : scene.attackerPostHp) ?? scene.attacker.hp : scene.attacker.hp} />
        {!selfSupport && <Health unit={scene.defender} hp={impacted ? scene.defenderPostHp ?? scene.defender.hp : scene.defender.hp} />}
      </footer>
    </section>
  </div>;
}
