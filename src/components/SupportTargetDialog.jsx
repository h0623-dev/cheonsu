import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Heart, Shield, Check } from 'lucide-react';
import { getSupportSkillCandidates } from '../data/skills.js';

export default function SupportTargetDialog({ actor, skill, units, getPortrait, onConfirm, onClose }) {
  const ref = useRef(null);
  const [selected, setSelected] = useState([]);
  useEffect(() => { ref.current.showModal(); }, []);
  const candidates = getSupportSkillCandidates(actor, skill, units);
  const max = skill.targets ?? candidates.length;
  const chosen = selected.filter(id => candidates.some(unit => unit.id === id));
  const toggle = id => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id)
    : max === 1 ? [id] : previous.length < max ? [...previous, id] : previous);
  return createPortal(<dialog ref={ref} className="world-item-dialog support-target-dialog" aria-labelledby="support-target-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <section className="world-item-sheet">
      <header><h2 id="support-target-title">{skill.type === 'heal' ? <Heart size={20} /> : <Shield size={20} />}{skill.name}</h2>
        <button className="icon-button" onClick={onClose} title="취소" aria-label="보조 마법 취소"><X size={22} /></button></header>
      <div className="support-selection-count">대상 {chosen.length} / {max}명 · 사거리 {skill.range}칸</div>
      <div className="support-target-list">{units.filter(unit => unit.type === 'ally' && unit.hp > 0).map(unit => {
        const eligible = candidates.some(candidate => candidate.id === unit.id);
        const checked = chosen.includes(unit.id);
        const distance = Math.abs(unit.x - actor.x) + Math.abs(unit.y - actor.y);
        return <button key={unit.id} data-target-id={unit.id} aria-pressed={checked}
          disabled={!eligible || (!checked && max > 1 && chosen.length >= max)} onClick={() => toggle(unit.id)}>
          <img src={getPortrait(unit)} alt="" /><span><strong>{unit.name}{unit.id === actor.id ? ' · 자신' : ''}</strong>
            <span>HP {unit.hp} / {unit.maxHp} · {distance}칸</span>
            {!eligible && <small>{distance > skill.range ? '사거리 밖' : '회복할 상태 없음'}</small>}
          </span><Check size={20} style={{ visibility: checked ? 'visible' : 'hidden' }} />
        </button>;
      })}</div>
      <footer><button onClick={onClose}>취소</button><button disabled={!chosen.length} onClick={() => onConfirm(chosen)}>마법 사용</button></footer>
    </section>
  </dialog>, document.body);
}
