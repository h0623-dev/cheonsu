import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, ShoppingBag, BedDouble, Shield, Swords, Check } from 'lucide-react';

const facilities = { shop: ['상점', ShoppingBag], inn: ['여관', BedDouble], armory: ['장비점', Shield], training: ['훈련소', Swords] };
const gearPrices = { ironSword: 500, chainArmor: 800 };

export default function TownFacilityDialog({ facility, party, getPortrait, items, inventory, equipment, gearInventory, gold,
  message, onClose, onBuyItem, onBuyGear, onEquip, onUnequip, onRest, onAction, onSave, saveNotice }) {
  const ref = useRef(null);
  const [tab, setTab] = useState('items');
  const [unitId, setUnitId] = useState(party[0]?.id);
  const unit = party.find(value => value.id === unitId) || party[0];
  const [title, Icon] = facilities[facility];
  useEffect(() => { ref.current.showModal(); }, []);
  return createPortal(<dialog ref={ref} className="town-facility-dialog" aria-labelledby="town-facility-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id="town-facility-title"><Icon size={22} />{title}</h2><strong>{gold}G</strong>
      <button className="icon-button" title="닫기" aria-label="시설 닫기" onClick={onClose}><X size={22} /></button></header>
    <div className="town-facility-body">
      {facility === 'shop' && <>
        <div className="town-shop-tabs" role="tablist" aria-label="상점 품목">
          {[['items', '소모품'], ['gear', '장비']].map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        <div className="town-stock-list" role="tabpanel">{tab === 'items' ? Object.values(items).map(item =>
          <article key={item.id}><div><strong>{item.name}</strong><span>{item.desc}</span><small>보유 {inventory[item.id] || 0}개</small></div>
            <button disabled={gold < item.price} onClick={() => onBuyItem(item.id)} aria-label={`${item.name} 구매 ${item.price}골드`}><ShoppingBag size={16} />{item.price}G</button></article>)
          : Object.entries(gearPrices).map(([id, price]) => <article key={id}><div><strong>{equipment[id].name}</strong><span>{equipment[id].desc}</span></div>
            <button disabled={gold < price || gearInventory.includes(id)} onClick={() => onBuyGear(id, price)}>{gearInventory.includes(id) ? '보유 중' : `${price}G`}</button></article>)}</div>
      </>}
      {facility === 'armory' && unit && <>
        <label className="town-unit-select">캐릭터<select aria-label="장비 캐릭터" value={unit.id} onChange={event => setUnitId(event.target.value)}>{party.map(member => <option key={member.id} value={member.id}>{member.name} · Lv.{member.level}</option>)}</select></label>
        <div className="town-unit-summary"><img src={getPortrait(unit)} alt="" /><div><strong>{unit.name}</strong><span>공격 {unit.atk} · 방어 {unit.def}</span><span>HP {unit.hp} / {unit.maxHp}</span></div></div>
        <div className="town-equipment-slots">{[['weapon', '무기'], ['armor', '방어구']].map(([slot, label]) => <div key={slot}>
          <span>{label}</span><strong>{equipment[unit.equipment?.[slot]]?.name || '없음'}</strong><button disabled={!unit.equipment?.[slot]} onClick={() => onUnequip(slot, unit.id)}>해제</button></div>)}</div>
        <div className="town-stock-list">{gearInventory.filter(id => equipment[id]?.allowed.includes(unit.id)).map(id => {
          const gear = equipment[id]; const equipped = unit.equipment?.[gear.slot] === id;
          return <article key={id}><div><strong>{gear.name}</strong><span>{gear.desc}</span></div><button aria-label={`${gear.name} 장착`} disabled={equipped} onClick={() => onEquip(id, unit.id)}>{equipped ? <><Check size={16} />장착 중</> : '장착'}</button></article>;
        })}</div>
        <button className="town-secondary-action" onClick={() => onAction('forge')}>제련소</button>
      </>}
      {facility === 'inn' && <>
        <div className="town-rest-party">{party.map(member => <div key={member.id}><img src={getPortrait(member)} alt="" /><strong>{member.name}</strong><span>HP {member.hp} / {member.maxHp}</span></div>)}</div>
        <button className="town-primary-action" onClick={onRest}><BedDouble size={19} />모두 휴식 · 무료</button>
      </>}
      {facility === 'training' && <div className="town-training-actions">{[['training', '훈련'], ['skill', '스킬 강화'], ['promote', '전직'], ['journal', '탐색 기록']].map(([id, label]) => <button key={id} onClick={() => onAction(id)}><Swords size={18} />{label}</button>)}</div>}
      <p className="town-facility-message" role="status">{message}</p>
    </div>
    <footer><span role="status" className={saveNotice?.ok === false ? 'save-failed' : ''}>{saveNotice?.text || ''}</span><button className="prominent-save" onClick={onSave}><Save size={18} />저장</button></footer>
  </dialog>, document.body);
}
