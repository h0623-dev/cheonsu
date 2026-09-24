import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Swords, Heart, Shield, Sparkles } from 'lucide-react';
import { getUnitSkills, getSkillCooldown, skillDescription, getSupportSkillTargets } from '../data/skills.js';

export default function SkillDialog({ unit, units, onSelect, onClose }) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current.open) ref.current.showModal(); }, []);
  return createPortal(<dialog ref={ref} className="world-item-dialog skill-choice-dialog" aria-labelledby="skill-choice-title"
    onClose={onClose} onCancel={event => { event.preventDefault(); ref.current.close(); }}
    onClick={event => { if (event.target === ref.current) ref.current.close(); }}>
    <section className="world-item-sheet">
      <header><h2 id="skill-choice-title"><Sparkles size={20} />{unit.name}의 스킬</h2><button className="icon-button" title="닫기" aria-label="스킬 선택 닫기" onClick={() => ref.current.close()}><X size={22} /></button></header>
      <div className="skill-choice-list">{getUnitSkills(unit).map(skill => {
        const cooldown = getSkillCooldown(unit, skill.id);
        const noTarget = skill.type !== 'attack' && !getSupportSkillTargets(unit, skill, units).length;
        const Icon = skill.type === 'heal' ? Heart : skill.type === 'guard' ? Shield : Swords;
        return <button key={skill.id} data-skill-id={skill.id} disabled={cooldown > 0 || noTarget} onClick={() => onSelect(skill.id)}>
          <Icon size={25} /><span><strong>{skill.name}{unit.learnedTechniques?.includes(skill.id) && <span className="discovered-skill-label"> · 비전</span>}</strong><small>{skillDescription(skill, unit.skillLevel || 0)}</small>
            <em>{skill.type === 'guard' ? '수호' : `사거리 ${skill.range}`} · 재사용 {skill.cooldown}턴</em></span>
          <b>{cooldown ? `${cooldown}턴 후` : noTarget ? '대상 없음' : '선택'}</b>
        </button>;
      })}</div>
      <footer><button onClick={() => ref.current.close()}>취소</button></footer>
    </section>
  </dialog>, document.body);
}
