import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, ShoppingBag, BedDouble, Shield, Swords, Coins, FlaskConical } from 'lucide-react';
import ArmoryPanel, { GearIcon } from './ArmoryPanel.jsx';

const facilities = { shop: ['상점', ShoppingBag], inn: ['여관', BedDouble], armory: ['장비점', Shield], training: ['훈련소', Swords] };
const gearPrices = { ironSword: 500, chainArmor: 800 };

export default function TownFacilityDialog({ facility, party, getPortrait, items, inventory, equipment, gearInventory, gold,
  message, trainingAvailability, onClose, onBuyItem, onBuyGear, onEquip, onUnequip, onRest, onAction, onSave, saveNotice, initialUnitId }) {
  const ref = useRef(null);
  const [tab, setTab] = useState('items');
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
        <div className="town-stock-list">{tab === 'items' ? Object.values(items).map(item =>
          <article key={item.id}><FlaskConical className="town-stock-icon" size={24} /><div><strong>{item.name}</strong><span>{item.desc}</span><small>보유 {inventory[item.id] || 0}개</small></div>
            <button disabled={gold < item.price} onClick={() => onBuyItem(item.id)} aria-label={`${item.name} 구매 ${item.price}골드`}><ShoppingBag size={16} />{item.price}G</button></article>)
          : Object.entries(gearPrices).map(([id, price]) => <article key={id}><GearIcon gear={equipment[id]} /><div><strong>{equipment[id].name}</strong><span>{equipment[id].desc}</span></div>
            <button disabled={gold < price || gearInventory.includes(id)} onClick={() => onBuyGear(id, price)}>{gearInventory.includes(id) ? '보유 중' : `${price}G`}</button></article>)}</div>
      </>}
      {facility === 'armory' && <ArmoryPanel party={party} initialUnitId={initialUnitId} getPortrait={getPortrait} equipment={equipment} gearInventory={gearInventory}
        onEquip={onEquip} onUnequip={onUnequip} onForge={() => onAction('forge')} />}
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
