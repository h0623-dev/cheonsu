import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, ShoppingBag, BedDouble, Shield, Swords, Coins, FlaskConical, LockKeyhole, Check, Gem } from 'lucide-react';
import ArmoryPanel, { GearIcon } from './ArmoryPanel.jsx';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, getGearShopAvailability, getGearShopPrice } from '../data/equipment.js';
import { getGearEnhanceBonus } from '../engine/partyEngine.js';

const facilities = { shop: ['상점', ShoppingBag], inn: ['여관', BedDouble], armory: ['장비점', Shield], training: ['훈련소', Swords] };
const slotIcons = { weapon: Swords, armor: Shield, accessory: Gem };

function GearShop({ party, equipment, gearInventory, gearEnhance, clearedStages, gold, onBuyGear }) {
  const [slot, setSlot] = useState('all');
  const [unitId, setUnitId] = useState('all');
  const [stock, setStock] = useState('all');
  const owned = new Set(gearInventory);
  const unit = party.find(member => member.id === unitId);
  const gearList = Object.values(equipment).filter(gear => {
    if (slot !== 'all' && gear.slot !== slot) return false;
    if (unit && !gear.allowed.includes(unit.id)) return false;
    if (stock === 'missing' && owned.has(gear.id)) return false;
    if (stock === 'available' && (owned.has(gear.id) || !getGearShopAvailability(gear, clearedStages).ok || gold < getGearShopPrice(gear))) return false;
    return true;
  }).sort((a, b) => (a.rewardStage || a.unlockStage || 0) - (b.rewardStage || b.unlockStage || 0)
    || EQUIPMENT_SLOTS.indexOf(a.slot) - EQUIPMENT_SLOTS.indexOf(b.slot)
    || (getGearShopPrice(a) || 0) - (getGearShopPrice(b) || 0));
  return <section className="town-gear-shop" aria-label="장비 상점">
    <p className="town-gear-help">무기·방어구·장신구를 한 가지씩 조합하세요. 한 번 구매하면 착용 가능한 동료가 함께 사용할 수 있습니다.</p>
    <div className="town-gear-slot-filter" role="group" aria-label="상점 장비 부위">
      <button aria-pressed={slot === 'all'} onClick={() => setSlot('all')}>전체</button>
      {EQUIPMENT_SLOTS.map(id => {
        const Icon = slotIcons[id];
        return <button key={id} aria-pressed={slot === id} onClick={() => setSlot(id)}><Icon size={15} />{EQUIPMENT_SLOT_LABELS[id]}</button>;
      })}
    </div>
    <div className="town-gear-filters">
      <label>착용 동료<select aria-label="상점 착용 동료" value={unit ? unitId : 'all'} onChange={event => setUnitId(event.target.value)}>
        <option value="all">모든 장비</option>{party.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select></label>
      <label>목록<select aria-label="상점 장비 목록" value={stock} onChange={event => setStock(event.target.value)}>
        <option value="all">전체 품목</option><option value="missing">아직 없는 장비</option><option value="available">지금 구매 가능</option>
      </select></label>
    </div>
    <p className="town-gear-result" role="status">{unit ? `${unit.name}의 ` : ''}{slot === 'all' ? '장비' : EQUIPMENT_SLOT_LABELS[slot]} {gearList.length}종</p>
    <div className="town-stock-list town-gear-stock">{gearList.map(gear => {
      const availability = getGearShopAvailability(gear, clearedStages);
      const price = getGearShopPrice(gear);
      const isOwned = owned.has(gear.id);
      const bonus = getGearEnhanceBonus(gear, gearEnhance[gear.id]);
      const members = party.filter(member => gear.allowed.includes(member.id));
      const wearers = unit ? `${unit.name} 착용 가능` : members.length === party.length && party.length ? '현재 동료 모두 착용 가능'
        : members.length ? `${members.slice(0, 3).map(member => member.name).join(' · ')}${members.length > 3 ? ` 외 ${members.length - 3}명` : ''} 착용 가능` : '합류 전 동료용 장비';
      const purchaseDisabled = isOwned || !availability.ok || price === null || gold < price;
      return <article key={gear.id} className={isOwned ? 'gear-stock-owned' : availability.ok ? '' : 'gear-stock-locked'}>
        <GearIcon gear={gear} />
        <div className="town-gear-description">
          <small className="town-gear-family">{EQUIPMENT_SLOT_LABELS[gear.slot]} · {gear.family}</small>
          <strong>{gear.name}{gearEnhance[gear.id] ? ` +${gearEnhance[gear.id]}` : ''}</strong>
          <span className="town-gear-stats">공격 +{(gear.atk || 0) + bonus.atk} · 방어 +{(gear.def || 0) + bonus.def}{gearEnhance[gear.id] ? ' (강화 포함)' : ''}</span>
          <span>{wearers}</span>
          {gear.rewardStage ? <small className="town-gear-source">제{gear.rewardStage}장 첫 승리 보상</small>
            : !availability.ok ? <small className="town-gear-source"><LockKeyhole size={13} />{availability.reason}</small>
              : gear.unlockStage > 0 && <small className="town-gear-source">제{gear.unlockStage}장 보급품 개방</small>}
        </div>
        <div className="town-gear-purchase">
          {price !== null && <span>{price.toLocaleString()} G</span>}
          <button disabled={purchaseDisabled} onClick={() => onBuyGear(gear.id, price)}
            aria-label={isOwned ? `${gear.name} 보유 중` : price === null ? `${gear.name} 모험 보상` : `${gear.name} 구매 ${price}골드`}>
            {isOwned ? <><Check size={15} />보유 중</> : !availability.ok ? <><LockKeyhole size={14} />{price === null ? '보상 장비' : '미개방'}</> : <><ShoppingBag size={15} />구매</>}
          </button>
          {!isOwned && availability.ok && price !== null && gold < price && <small>골드 부족</small>}
        </div>
      </article>;
    })}</div>
    {!gearList.length && <p className="armory-empty">조건에 맞는 장비가 없습니다. 동료나 목록 조건을 바꿔 보세요.</p>}
  </section>;
}

export default function TownFacilityDialog({ facility, party, getPortrait, items, inventory, equipment, gearInventory, gearEnhance = {}, clearedStages = [], gold,
  message, trainingAvailability, onClose, onBuyItem, onBuyGear, onEquip, onUnequip, onRest, onAction, onSave, saveNotice, initialUnitId, initialShopTab = 'items' }) {
  const ref = useRef(null);
  const [tab, setTab] = useState(initialShopTab === 'gear' ? 'gear' : 'items');
  const [title, Icon] = facilities[facility];
  useEffect(() => { ref.current.showModal(); }, []);
  return createPortal(<dialog ref={ref} className={`town-facility-dialog facility-${facility}`} aria-labelledby="town-facility-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id="town-facility-title"><Icon size={22} />{title}</h2><strong><Coins size={16} />{gold.toLocaleString()} G</strong>
      <button className="icon-button" title="닫기" aria-label="시설 닫기" onClick={onClose}><X size={22} /></button></header>
    <div className="town-facility-body">
      {facility === 'shop' && <>
        <div className="town-shop-tabs" role="group" aria-label="상점 품목">
          {[['items', '소모품', FlaskConical], ['gear', '장비', Swords]].map(([id, label, TabIcon]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}><TabIcon size={17} />{label}</button>)}
        </div>
        {tab === 'items' ? <div className="town-stock-list">{Object.values(items).map(item =>
          <article key={item.id}><FlaskConical className="town-stock-icon" size={24} /><div><strong>{item.name}</strong><span>{item.desc}</span><small>보유 {inventory[item.id] || 0}개</small></div>
            <button disabled={gold < item.price} onClick={() => onBuyItem(item.id)} aria-label={`${item.name} 구매 ${item.price}골드`}><ShoppingBag size={16} />{item.price}G</button></article>)}</div>
          : <GearShop party={party} equipment={equipment} gearInventory={gearInventory} gearEnhance={gearEnhance} clearedStages={clearedStages} gold={gold} onBuyGear={onBuyGear} />}
      </>}
      {facility === 'armory' && <ArmoryPanel party={party} initialUnitId={initialUnitId} getPortrait={getPortrait} equipment={equipment} gearInventory={gearInventory} gearEnhance={gearEnhance} clearedStages={clearedStages}
        onEquip={onEquip} onUnequip={onUnequip} onForge={() => onAction('forge')} onShop={() => onAction('shop')} />}
      {facility === 'inn' && <>
        <div className="town-rest-party">{party.map(member => <div key={member.id}><img src={getPortrait(member)} alt="" /><strong>{member.name}</strong><span>HP {member.hp} / {member.maxHp}</span></div>)}</div>
        <button className="town-primary-action" onClick={onRest}><BedDouble size={19} />모두 휴식 · 무료</button>
      </>}
      {facility === 'training' && <>
        {!trainingAvailability?.allowed && trainingAvailability?.reason && <p role="status">{trainingAvailability.reason}</p>}
        <div className="town-training-actions">{[['training', '훈련'], ['skill', '스킬 강화'], ['promote', '전직'], ['journal', '탐색 기록']].map(([id, label]) => <button key={id} disabled={id === 'training' && trainingAvailability?.allowed === false} onClick={() => onAction(id)}><Swords size={18} />{label}</button>)}</div>
      </>}
    </div>
    <footer><span role="status" className={saveNotice?.ok === false ? 'save-failed' : ''}>{saveNotice?.text || message || ''}</span><button className="prominent-save" onClick={onSave}><Save size={18} />저장</button></footer>
  </dialog>, document.body);
}
