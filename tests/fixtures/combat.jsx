import React from 'react';
import { createRoot } from 'react-dom/client';
import CombatScene from '../../src/components/CombatScene.jsx';
import '../../src/combat-scene.css';

const params = new URLSearchParams(location.search);
const key = params.get('unit') || 'hero';
const kind = params.get('kind') || 'attack';
const heal = kind === 'heal';
const guard = kind === 'guard';
const hit = kind !== 'miss';
const scene = {
  id: 'fixture', attacker: { id: key, name: key, type: 'ally', hp: 42, maxHp: 50 },
  defender: { id: guard ? key : heal ? 'hero' : 'blackguard', name: guard ? key : heal ? '카일' : '적 기사', type: heal || guard ? 'ally' : 'enemy', hp: guard ? 42 : 30, maxHp: 50 },
  defenderPostHp: heal || guard ? 42 : hit ? 18 : 30, mode: kind === 'skill' ? 'skill' : 'attack',
  title: heal ? '치유의 빛' : kind === 'skill' ? '정령의 기도' : '공격', effectLabel: '전투',
  outcome: { heal, guard, hit, damage: guard ? 0 : 12, crit: params.has('crit') }, durationMs: 4000,
};
createRoot(document.getElementById('root')).render(<CombatScene scene={scene} attackerKey={key} defenderKey={heal || guard ? 'hero' : 'blackguard'} background="/art/world-v2/scenes/forest.webp" />);
