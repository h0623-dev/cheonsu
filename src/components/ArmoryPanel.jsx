import { useState } from 'react';
import { ArrowRight, ArrowUp, ArrowDown, Check, Sword, Shield, Shirt, WandSparkles, BowArrow, Hammer, CircleSlash, Heart, Gem, Music, Hand, ShoppingBag, BookOpen, ScrollText, Axe, Swords } from 'lucide-react';
import { applyEquipmentStats, getGearEnhanceBonus } from '../engine/partyEngine.js';
import { formatAttackRange } from '../engine/movement.js';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, getGearPresentation, getGearShopAvailability, getGearShopPrice } from '../data/equipment.js';

const gearIcons = { sword: Sword, shield: Shield, bow: BowArrow, spear: Sword, dagger: Sword, staff: WandSparkles, book: BookOpen, charm: ScrollText, axe: Axe, arsenal: Swords, lyre: Music, fist: Hand, hammer: Hammer, armor: Shirt, robe: Shirt, ring: Gem, amulet: Gem };
const slotIcons = { weapon: Sword, armor: Shield, accessory: Gem };

export function GearIcon({ gear, size = 22 }) {
  const Icon = gearIcons[gear?.icon] || (gear?.slot === 'armor' ? Shirt : slotIcons[gear?.slot]) || Sword;
  return <Icon size={size} aria-hidden="true" />;
}

function gearName(gear, unit) {
  if (!gear) return '미장착';
  const level = unit.gearEnhance?.[gear.id] || 0;
  return `${getGearPresentation(gear, unit).name}${level ? ` +${level}` : ''}`;
}

function gearAcquisitionText(gear, clearedStages = []) {
  if (gear.rewardStage) return `제${gear.rewardStage}장 첫 승리 보상`;
  const availability = getGearShopAvailability(gear, clearedStages);
  const price = getGearShopPrice(gear);
  if (price === null) return availability.reason || '모험 중 획득';
  return availability.ok ? `상점 · ${price.toLocaleString()} G` : availability.reason;
}

function Loadout({ unit, equipment, gearInventory, gearEnhance = {}, clearedStages = [], getPortrait, onEquip, onUnequip, onForge, onShop }) {
  const [slot, setSlot] = useState('weapon');
  const [selection, setSelection] = useState(null);
  const enhancedUnit = { ...unit, gearEnhance: { ...unit.gearEnhance, ...gearEnhance } };
  const owned = new Set(gearInventory);
  const currentId = unit.equipment?.[slot] || null;
  const matching = Object.values(equipment).filter(gear => gear.slot === slot && gear.allowed.includes(unit.id))
    .sort((a, b) => (a.rewardStage || a.unlockStage || 0) - (b.rewardStage || b.unlockStage || 0)
      || (getGearShopPrice(a) || 0) - (getGearShopPrice(b) || 0))
    .map(gear => getGearPresentation(gear, unit));
  const available = matching.filter(gear => owned.has(gear.id));
  const missing = matching.filter(gear => !owned.has(gear.id));
  const selectedId = selection?.slot === slot ? selection.id : currentId;
  const selectedGear = getGearPresentation(equipment[selectedId], unit);
  const current = applyEquipmentStats(enhancedUnit);
  const preview = applyEquipmentStats({ ...enhancedUnit, equipment: { ...unit.equipment, [slot]: selectedId } });
  const unchanged = selectedId === currentId;
  const chooseSlot = value => { setSlot(value); setSelection(null); };
  const slotLabel = EQUIPMENT_SLOT_LABELS[slot];
  return <>
    <div className="armory-workspace">
      <section className="armory-unit-overview" aria-label={`${unit.name} 능력치`}>
        <img className="armory-hero-portrait" src={getPortrait(unit)} alt={unit.name} />
        <div className="armory-unit-heading"><small>Lv.{unit.level || 1}</small><h3>{unit.name}</h3><span><Heart size={14} />{unit.hp} / {unit.maxHp}</span></div>
        <dl className="armory-base-stats"><div><dt>공격</dt><dd>{current.atk}</dd></div><div><dt>방어</dt><dd>{current.def}</dd></div><div><dt>사거리</dt><dd>{formatAttackRange(unit)}<small>칸</small></dd></div></dl>
        <button className="armory-forge" onClick={onForge}><Hammer size={17} />제련소<ArrowRight size={16} /></button>
        <div className="armory-equipped-slots" aria-label="현재 착용한 세 부위">
          {EQUIPMENT_SLOTS.map(id => {
            const gear = getGearPresentation(equipment[unit.equipment?.[id]], unit);
            const Icon = slotIcons[id];
            return <button key={id} aria-label={`${EQUIPMENT_SLOT_LABELS[id]} 장착 현황: ${gearName(gear, enhancedUnit)}`} aria-pressed={slot === id} onClick={() => chooseSlot(id)}>
              {gear ? <GearIcon gear={gear} size={17} /> : <Icon size={17} />}<span><small>{EQUIPMENT_SLOT_LABELS[id]}</small><strong>{gearName(gear, enhancedUnit)}</strong></span><ArrowRight size={14} />
            </button>;
          })}
        </div>
        <p className="armory-sharing-note">한 번 얻은 장비는 착용 가능한 동료가 함께 사용할 수 있습니다. 강화도 함께 적용됩니다.</p>
      </section>
      <section className="armory-loadout" aria-label="장비 선택">
        <div className="armory-slot-tabs" role="group" aria-label="장비 부위">
          {EQUIPMENT_SLOTS.map(id => {
            const Icon = slotIcons[id];
            return <button key={id} aria-pressed={slot === id} onClick={() => chooseSlot(id)}><Icon size={17} />{EQUIPMENT_SLOT_LABELS[id]}</button>;
          })}
        </div>
        <div className="armory-current"><small>현재 장비</small><strong>{gearName(equipment[currentId], enhancedUnit)}</strong><Check size={16} /></div>
        <div className="armory-list-heading"><h4>보유 {slotLabel}</h4><span>{available.length}종</span></div>
        <div className="armory-inventory" role="group" aria-label="보유 장비">
          {available.map(gear => {
            const bonus = getGearEnhanceBonus(gear, enhancedUnit.gearEnhance?.[gear.id]);
            return <button className="armory-gear" key={gear.id} aria-label={`${gear.name} 선택`} aria-pressed={selectedId === gear.id} onClick={() => setSelection({ slot, id: gear.id })}>
              <span className="armory-gear-icon"><GearIcon gear={gear} /></span>
              <span><strong>{gearName(gear, enhancedUnit)}</strong><small>공격 +{(gear.atk || 0) + bonus.atk} · 방어 +{(gear.def || 0) + bonus.def}</small></span>
              {currentId === gear.id && <em><Check size={13} />장착 중</em>}
            </button>;
          })}
          {!available.length && <p className="armory-empty">보유한 {slotLabel} 중 {unit.name}이 착용할 수 있는 장비가 없습니다. 아래에서 얻는 방법을 확인하세요.</p>}
          <button className="armory-gear armory-remove" aria-label={`${slotLabel} 해제`} aria-pressed={selectedId === null} onClick={() => setSelection({ slot, id: null })}>
            <CircleSlash size={20} /><span>{slotLabel} 해제</span>
          </button>
        </div>
        {missing.length > 0 && <details className="armory-missing" key={`${unit.id}-${slot}`}>
          <summary>아직 없는 {slotLabel} <span>{missing.length}종 · 얻는 방법</span></summary>
          <ul>{missing.map(gear => <li key={gear.id}>
            <GearIcon gear={gear} size={19} /><div><strong>{gear.name}</strong><span>공격 +{gear.atk || 0} · 방어 +{gear.def || 0}</span><small>{gearAcquisitionText(gear, clearedStages)}</small></div>
          </li>)}</ul>
          {onShop && <button className="armory-shop-link" onClick={onShop}><ShoppingBag size={16} />상점으로 이동<ArrowRight size={15} /></button>}
        </details>}
      </section>
    </div>
    <section className="armory-comparison" aria-label="장비 교체 비교">
      <div className="armory-comparison-title"><span>{unchanged ? '현재 장착' : '교체 예정'}</span><strong>{gearName(selectedGear, enhancedUnit)}</strong></div>
      <div className="armory-comparison-stats">{[['atk', '공격', Sword], ['def', '방어', Shield]].map(([stat, label, Icon]) => {
        const delta = preview[stat] - current[stat];
        return <div key={stat} aria-label={`${label} ${current[stat]}에서 ${preview[stat]}, ${delta > 0 ? '+' : ''}${delta}`}>
          <span><Icon size={14} />{label}</span><b>{current[stat]}</b><ArrowRight size={14} /><b>{preview[stat]}</b>
          <small className={delta > 0 ? 'stat-up' : delta < 0 ? 'stat-down' : ''}>{delta > 0 ? <ArrowUp size={12} /> : delta < 0 ? <ArrowDown size={12} /> : null}{delta > 0 ? '+' : ''}{delta}</small>
        </div>;
      })}</div>
      <button className="armory-equip" disabled={unchanged} aria-label={selectedGear ? `${selectedGear.name} 장착` : `${slotLabel} 해제 적용`}
        onClick={() => selectedId ? onEquip(selectedId, unit.id) : onUnequip(slot, unit.id)}><Check size={18} />{unchanged ? '장착 중' : selectedId ? '장착하기' : '해제하기'}</button>
    </section>
  </>;
}

export default function ArmoryPanel({ party, getPortrait, initialUnitId, ...props }) {
  const [unitId, setUnitId] = useState(initialUnitId || party[0]?.id);
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
