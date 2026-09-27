import { useState } from 'react';
import { ArrowRight, ArrowUp, ArrowDown, Check, Sword, Shield, Shirt, WandSparkles, BowArrow, Hammer, CircleSlash, Heart } from 'lucide-react';
import { applyEquipmentStats, getGearEnhanceBonus } from '../engine/partyEngine.js';
import { formatAttackRange } from '../engine/movement.js';

const gearIcons = { fireStaff: WandSparkles, holyStaff: WandSparkles, hunterBow: BowArrow, guardShield: Shield };
export function GearIcon({ gear, size = 22 }) {
  const Icon = gearIcons[gear?.id] || (gear?.slot === 'armor' ? Shirt : Sword);
  return <Icon size={size} aria-hidden="true" />;
}

function gearName(gear, unit) {
  if (!gear) return '미장착';
  const level = unit.gearEnhance?.[gear.id] || 0;
  return `${gear.name}${level ? ` +${level}` : ''}`;
}

function Loadout({ unit, equipment, gearInventory, getPortrait, onEquip, onUnequip, onForge }) {
  const [slot, setSlot] = useState('weapon');
  const [selection, setSelection] = useState(null);
  const currentId = unit.equipment?.[slot] || null;
  const available = gearInventory.filter(id => equipment[id]?.slot === slot && equipment[id].allowed.includes(unit.id));
  const selectedId = selection?.slot === slot ? selection.id : currentId;
  const selectedGear = equipment[selectedId];
  const current = applyEquipmentStats(unit);
  const preview = applyEquipmentStats({ ...unit, equipment: { ...unit.equipment, [slot]: selectedId } });
  const unchanged = selectedId === currentId;
  const chooseSlot = value => { setSlot(value); setSelection(null); };
  return <>
    <div className="armory-workspace">
      <section className="armory-unit-overview" aria-label={`${unit.name} 능력치`}>
        <img className="armory-hero-portrait" src={getPortrait(unit)} alt={unit.name} />
        <div className="armory-unit-heading"><small>Lv.{unit.level || 1}</small><h3>{unit.name}</h3><span><Heart size={14} />{unit.hp} / {unit.maxHp}</span></div>
        <dl className="armory-base-stats"><div><dt>공격</dt><dd>{current.atk}</dd></div><div><dt>방어</dt><dd>{current.def}</dd></div><div><dt>사거리</dt><dd>{formatAttackRange(unit)}<small>칸</small></dd></div></dl>
        <button className="armory-forge" onClick={onForge}><Hammer size={17} />제련소<ArrowRight size={16} /></button>
      </section>
      <section className="armory-loadout" aria-label="장비 선택">
        <div className="armory-slot-tabs" role="group" aria-label="장비 부위">
          {[['weapon', '무기', Sword], ['armor', '방어구', Shield]].map(([id, label, Icon]) =>
            <button key={id} aria-pressed={slot === id} onClick={() => chooseSlot(id)}><Icon size={18} />{label}</button>)}
        </div>
        <div className="armory-current"><small>현재 장비</small><strong>{gearName(equipment[currentId], unit)}</strong><Check size={16} /></div>
        <div className="armory-inventory" role="group" aria-label="보유 장비">
          {available.map(id => {
            const gear = equipment[id];
            const bonus = getGearEnhanceBonus(gear, unit.gearEnhance?.[id]);
            return <button className="armory-gear" key={id} aria-label={`${gear.name} 선택`} aria-pressed={selectedId === id} onClick={() => setSelection({ slot, id })}>
              <span className="armory-gear-icon"><GearIcon gear={gear} /></span>
              <span><strong>{gearName(gear, unit)}</strong><small>공격 +{(gear.atk || 0) + bonus.atk} · 방어 +{(gear.def || 0) + bonus.def}</small></span>
              {currentId === id && <em><Check size={13} />장착 중</em>}
            </button>;
          })}
          {!available.length && <p className="armory-empty">장착 가능한 {slot === 'weapon' ? '무기' : '방어구'}가 없습니다.</p>}
          <button className="armory-gear armory-remove" aria-pressed={selectedId === null} onClick={() => setSelection({ slot, id: null })}>
            <CircleSlash size={20} /><span>{slot === 'weapon' ? '무기' : '방어구'} 해제</span>
          </button>
        </div>
      </section>
    </div>
    <section className="armory-comparison" aria-label="장비 교체 비교">
      <div className="armory-comparison-title"><span>{unchanged ? '현재 장착' : '교체 예정'}</span><strong>{gearName(selectedGear, unit)}</strong></div>
      <div className="armory-comparison-stats">{[['atk', '공격', Sword], ['def', '방어', Shield]].map(([stat, label, Icon]) => {
        const delta = preview[stat] - current[stat];
        return <div key={stat} aria-label={`${label} ${current[stat]}에서 ${preview[stat]}, ${delta > 0 ? '+' : ''}${delta}`}>
          <span><Icon size={14} />{label}</span><b>{current[stat]}</b><ArrowRight size={14} /><b>{preview[stat]}</b>
          <small className={delta > 0 ? 'stat-up' : delta < 0 ? 'stat-down' : ''}>{delta > 0 ? <ArrowUp size={12} /> : delta < 0 ? <ArrowDown size={12} /> : null}{delta > 0 ? '+' : ''}{delta}</small>
        </div>;
      })}</div>
      <button className="armory-equip" disabled={unchanged} aria-label={selectedGear ? `${selectedGear.name} 장착` : `${slot === 'weapon' ? '무기' : '방어구'} 해제 적용`}
        onClick={() => selectedId ? onEquip(selectedId, unit.id) : onUnequip(slot, unit.id)}><Check size={18} />{unchanged ? '장착 중' : selectedId ? '장착하기' : '해제하기'}</button>
    </section>
  </>;
}

export default function ArmoryPanel({ party, getPortrait, ...props }) {
  const [unitId, setUnitId] = useState(party[0]?.id);
  const unit = party.find(member => member.id === unitId) || party[0];
  if (!unit) return <p>아직 합류한 동료가 없습니다.</p>;
  const onRosterKey = event => {
    const directions = { ArrowRight: 1, ArrowLeft: -1, Home: 0, End: party.length - 1 };
    if (!(event.key in directions)) return;
    event.preventDefault();
    const index = party.findIndex(member => member.id === unit.id);
    const next = event.key === 'Home' || event.key === 'End' ? directions[event.key] : (index + directions[event.key] + party.length) % party.length;
    setUnitId(party[next].id);
    const button = event.currentTarget.querySelectorAll('button')[next];
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  return <div className="armory-panel">
    <div className="armory-roster" role="tablist" aria-label="장비 캐릭터" onKeyDown={onRosterKey}>
      {party.map(member => <button key={member.id} id={`armory-tab-${member.id}`} role="tab" aria-selected={unit.id === member.id}
        aria-controls="armory-character-panel" aria-label={`${member.name} 장비`} tabIndex={unit.id === member.id ? 0 : -1}
        onClick={() => setUnitId(member.id)}><img src={getPortrait(member)} alt="" /><span>{member.name}</span><small>Lv.{member.level || 1}</small></button>)}
    </div>
    <div id="armory-character-panel" className="armory-character-panel" role="tabpanel" aria-labelledby={`armory-tab-${unit.id}`}>
      <Loadout key={unit.id} unit={unit} getPortrait={getPortrait} {...props} />
    </div>
  </div>;
}
