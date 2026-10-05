import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, Swords, Shield, Sparkles, Check } from 'lucide-react';
import { TRAINING_TYPES } from '../engine/growthEngine.js';
import './training-dialog.css';

const icons = { attack: Swords, defense: Shield, focus: Sparkles };

export default function TrainingDialog({ party, used, blockedReason, getPortrait, onTrain, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  const allies = party.filter(unit => unit.type === 'ally');
  return createPortal(<dialog ref={ref} className="company-training-dialog" aria-labelledby="company-training-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id="company-training-title"><Users size={22} /> 전체 훈련</h2>
      <button className="icon-button" onClick={onClose} aria-label="훈련 닫기" title="닫기"><X size={22} /></button></header>
    <div className="company-training-status" role="status"><span>동료 {allies.length}명</span>
      <strong>{blockedReason || (used ? '훈련 완료 · 남은 횟수 0 / 1' : '남은 횟수 1 / 1')}</strong></div>
    <div className="company-training-options">{TRAINING_TYPES.map(type => {
      const Icon = icons[type.id];
      return <button key={type.id} data-training-id={type.id} disabled={used || Boolean(blockedReason) || !allies.length} onClick={() => onTrain(type.id)}>
        <Icon size={22} /><span><strong>{type.name}</strong><small>{type.desc}</small></span>
      </button>;
    })}</div>
    <ul className="company-training-roster">{allies.map(unit => <li key={unit.id} data-training-unit={unit.id}>
      <img src={getPortrait(unit)} alt="" /><div><strong>{unit.name} <small>Lv.{unit.level}</small></strong>
        <span>EXP {unit.exp} / 100</span><small>공격 {unit.atk} · 방어 {unit.def}</small></div>
      {used && !blockedReason && <Check size={18} aria-label="훈련 완료" />}
    </li>)}</ul>
    <footer><button onClick={onClose}>닫기</button></footer>
  </dialog>, document.body);
}
