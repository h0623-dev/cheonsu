import { useEffect, useState } from 'react';
import { getCombatMotionSprite, getCombatEffect, getCombatPresentation, getCombatScale } from '../data/combatArt.js';

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

function FighterPoses({ unitKey, name, defender = false }) {
  const poses = defender ? ['ready', 'recoil', 'evade'] : ['ready', 'run-a', 'run-b', 'windup', 'strike', 'recover'];
  return <div className="fighter-body" style={{ '--combat-sprite-scale': getCombatScale(unitKey) }}><div className="fighter-poses">
    {poses.map(pose => <img key={pose} data-pose={pose}
      className={`fighter-frame fighter-${pose}${pose === 'strike' ? ' fighter-action' : ''}`}
      src={getCombatMotionSprite(unitKey, pose === 'ready' ? 'recover' : pose === 'evade' ? 'run-a' : pose)}
      alt={pose === 'ready' ? name : ''} draggable="false" />)}
  </div></div>;
}

function Health({ unit, hp }) {
  const percent = Math.max(0, Math.min(100, hp / Math.max(1, unit.maxHp) * 100));
  return <div className={`combat-health team-${unit.type === 'ally' ? 'ally' : 'enemy'}`}>
    <div><strong>{unit.name}</strong><span>{hp} / {unit.maxHp}</span></div>
    <div className="combat-health-track"><i style={{ width: `${percent}%` }} /></div>
  </div>;
}

export default function CombatScene({ scene, attackerKey, defenderKey, background, effectsEnabled = true }) {
  const [impactedScene, setImpactedScene] = useState(null);
  const impacted = impactedScene === scene;
  const duration = scene.durationMs || 1800;
  const presentation = getCombatPresentation(attackerKey, scene);
  const weaponMotion = presentation.support ? 'cast' : getWeaponMotion(attackerKey);
  const selfSupport = presentation.support && scene.attacker.id && scene.attacker.id === scene.defender.id;
  const enemy = ['enemy', 'boss'].includes(scene.attacker.type)
    ? { unit: scene.attacker, key: attackerKey, side: 'attacker' }
    : ['enemy', 'boss'].includes(scene.defender.type) && !selfSupport
      ? { unit: scene.defender, key: defenderKey, side: 'defender' } : null;
  useEffect(() => {
    const timer = setTimeout(() => setImpactedScene(scene), duration * 0.5);
    return () => clearTimeout(timer);
  }, [duration, scene]);
  const result = presentation.guarding ? '수호' : presentation.healing ? `+${scene.outcome.damage}` : presentation.miss ? '회피' : `${scene.outcome.damage}`;
  return <div className="painted-combat-overlay" role="status" aria-label={`${scene.attacker.name} ${scene.title}`}>
    <section key={scene.id} className={`painted-combat motion-${presentation.style} weapon-${weaponMotion} ${enemy?.unit.type === 'boss' ? 'has-boss' : ''} ${presentation.support ? 'is-support' : ''} ${selfSupport ? 'is-self-support' : ''} ${presentation.healing ? 'is-healing' : ''} ${presentation.guarding ? 'is-guarding' : ''} ${presentation.miss ? 'is-miss' : ''} ${scene.finish ? 'is-finish' : ''} ${!effectsEnabled ? 'motion-off' : ''}`}
      style={{ '--combat-duration': `${duration}ms`, '--combat-scene': `url("${background}")` }}>
      <header className="painted-combat-heading"><span>{scene.attacker.name}</span><h2>{scene.title}</h2><span>{scene.outcome?.crit ? '치명타' : scene.finish ? '결정타' : scene.effectLabel}</span></header>
      <div className="painted-combat-arena">
        {enemy && <aside className={`combat-enemy-intro intro-${enemy.side}`} aria-label={`${enemy.unit.type === 'boss' ? '적장' : '적군'} ${enemy.unit.name}`}>
          <span>{enemy.unit.type === 'boss' ? '적장' : '적군'} · {weaponLabels[getWeaponMotion(enemy.key)]}</span>
          <strong>{enemy.unit.name}</strong>
        </aside>}
        <div className="painted-fighter fighter-attacker">
          <div className="fighter-shadow" />
          <FighterPoses unitKey={attackerKey} name={scene.attacker.name} />
          <img className="combat-cast" src={getCombatEffect('cast')} alt="" />
        </div>
        {!selfSupport && <div className="painted-fighter fighter-defender">
          <div className="fighter-shadow" />
          <FighterPoses unitKey={defenderKey} name={scene.defender.name} defender />
        </div>}
        <img className="combat-strike" src={getCombatEffect(presentation.effect)} alt="" />
        <img className="combat-impact" src={getCombatEffect(presentation.style === 'ranged' ? 'impact' : presentation.effect)} alt="" />
        <div className="combat-result"><small>{scene.outcome?.crit ? 'CRITICAL' : presentation.guarding ? 'GUARD' : presentation.healing ? 'HEAL' : scene.finish ? 'FINISH' : ''}</small><strong>{result}</strong></div>
      </div>
      <footer className="painted-combat-health">
        <Health unit={scene.attacker} hp={impacted ? (selfSupport ? scene.defenderPostHp : scene.attackerPostHp) ?? scene.attacker.hp : scene.attacker.hp} />
        {!selfSupport && <Health unit={scene.defender} hp={impacted ? scene.defenderPostHp ?? scene.defender.hp : scene.defender.hp} />}
      </footer>
    </section>
  </div>;
}
