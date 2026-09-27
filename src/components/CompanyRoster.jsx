import { useState } from 'react';
import { ArrowLeft, Shield, Swords, Heart, Footprints, Crosshair, Sparkles, BookOpen } from 'lucide-react';
import { getCharacterProfile } from '../data/characterProfiles.js';
import { getPaintedVisualProfile } from '../data/unitVisuals.js';
import { getUnitSkills, skillDescription } from '../data/skills.js';
import { applyEquipmentStats } from '../engine/partyEngine.js';
import { formatAttackRange, getUnitMoveRange } from '../engine/movement.js';
import { EQUIPMENT } from '../data/equipment.js';

export default function CompanyRoster({ party, onBack, onManage, canManage }) {
  const [selectedId, setSelectedId] = useState(party[0]?.id);
  const member = party.find(unit => unit.id === selectedId) || party[0];
  if (!member) return <main className="ux-screen"><h1>기사단</h1><button onClick={onBack}>뒤로</button></main>;
  const unit = applyEquipmentStats(member), profile = getCharacterProfile(unit.id);
  return <main className="company-roster ux-screen">
    <header className="ux-page-header"><div><small>함께 걷는 {party.length}명</small><h1>기사단</h1></div><button onClick={onBack}><ArrowLeft size={19} />뒤로</button></header>
    <nav className="company-roster-list" aria-label="기사단 동료">{party.map(ally => <button key={ally.id} aria-label={`${ally.name} 선택`} aria-pressed={unit.id === ally.id} onClick={() => setSelectedId(ally.id)}><img src={getPaintedVisualProfile(ally.id)?.portrait} alt="" /><strong>{ally.name}</strong><small>Lv.{ally.level || 1}</small></button>)}</nav>
    <div className="company-dossier">
      <section className="company-identity" aria-label={`${unit.name} 소개`}>
        <img className="company-character" src={getPaintedVisualProfile(unit.id)?.cutscene} alt={unit.name} />
        <div><small>{profile.role} · Lv.{unit.level || 1}</small><h2>{unit.name}</h2><p>{profile.title}</p></div>
      </section>
      <div className="company-details">
        <dl className="company-stats">{[[Heart,'체력',`${unit.hp}/${unit.maxHp}`],[Swords,'공격',unit.atk],[Shield,'방어',unit.def],[Footprints,'이동',`${getUnitMoveRange(unit)}칸`],[Crosshair,'사거리',`${formatAttackRange(unit)}칸`]].map(([Icon,label,value]) => <div key={label}><dt><Icon size={15}/>{label}</dt><dd>{value}</dd></div>)}</dl>
        <section className="company-biography"><h3><BookOpen size={17}/>인물 기록</h3><p>{profile.bio}</p><p>{profile.bond}</p></section>
        <section className="company-skills"><h3><Sparkles size={17}/>고유 기술</h3>{getUnitSkills(unit).map(skill => <article key={skill.id}><div><strong>{skill.name}</strong><small>재사용 {skill.cooldown}턴</small></div><p>{skillDescription(skill, unit.skillLevel || 0)}</p></article>)}</section>
        <section className="company-loadout"><h3><Shield size={17}/>현재 장비</h3><p>{EQUIPMENT[unit.equipment?.weapon]?.name || '무기 미장착'} · {EQUIPMENT[unit.equipment?.armor]?.name || '방어구 미장착'}</p></section>
        {canManage && <div className="ux-action-grid"><button onClick={() => onManage('armory', unit.id)}><Shield size={18}/>장비 관리</button><button onClick={() => onManage('training', unit.id)}><Swords size={18}/>성장 관리</button></div>}
      </div>
    </div>
  </main>;
}
