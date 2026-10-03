import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Camera, Check, ChevronLeft, ChevronRight, Lock, Search, Sparkles, X } from 'lucide-react';
import { filterCharacterCollection, getCharacterCollection } from '../data/characterCollection.js';
import { skillDescription } from '../data/skills.js';
import './character-codex.css';

function CharacterDetail({ entry, onClose, onPrevious, onNext }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog ref={ref} className="character-detail-dialog" aria-labelledby="character-detail-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header><span>No. {String(entry.number).padStart(2, '0')} · {entry.status}</span><button autoFocus title="닫기" aria-label="캐릭터 정보 닫기" onClick={onClose}><X size={22}/></button></header>
    <div className="character-detail-scroll">
      <div className="character-detail-identity">
        <img className={entry.unlocked ? '' : 'collection-monochrome'} src={entry.art} alt={entry.name}/>
        <div><small>{entry.role}</small><h2 id="character-detail-title">{entry.name}</h2><p>{entry.title}</p><span className="collection-state">{entry.unlocked ? <Check size={15}/> : <Lock size={15}/>} {entry.status}</span></div>
      </div>
      <p className="collection-condition">{entry.condition}</p>
      {entry.unlocked && <>
        <section className="character-detail-story"><h3><BookOpen size={17}/>인물 기록</h3><p>{entry.bio}</p>{entry.bond && <p>{entry.bond}</p>}</section>
        {entry.skills.length > 0 && <section className="character-detail-skills"><h3><Sparkles size={17}/>고유 기술</h3>{entry.skills.map(skill => <div key={skill.id}><strong>{skill.name}</strong><small>재사용 {skill.cooldown}턴</small><p>{skillDescription(skill, entry.skillLevel)}</p></div>)}</section>}
      </>}
    </div>
    <footer><button disabled={!onPrevious} onClick={onPrevious} aria-label="이전 캐릭터" title="이전 캐릭터"><ChevronLeft size={22}/></button><span>{entry.name}</span><button disabled={!onNext} onClick={onNext} aria-label="다음 캐릭터" title="다음 캐릭터"><ChevronRight size={22}/></button></footer>
  </dialog>;
}

export default function CharacterCodex({ party, clearedStages, encounters, records, onBack, onPhoto }) {
  const [kind, setKind] = useState('ally'), [state, setState] = useState('all'), [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const entries = useMemo(() => getCharacterCollection({ party, clearedStages, encounters }), [party, clearedStages, encounters]);
  const visible = filterCharacterCollection(entries, { kind, state, query });
  const selectedIndex = visible.findIndex(entry => entry.id === selected);
  const entry = visible[selectedIndex];
  const group = entries.filter(item => kind === 'all' || item.kind === kind);
  const count = group.filter(item => item.unlocked).length;
  const recordList = records.filter(item => !query || `${item.title} ${item.category}`.includes(query));
  return <main className="codex-screen character-codex ux-screen">
    <header className="ux-page-header"><div><small>천수 기사단 기록실</small><h1>캐릭터 도감</h1></div><div className="collection-header-actions">{onPhoto && <button onClick={onPhoto} aria-label="도감 사진" title="도감 사진"><Camera size={19}/></button>}<button onClick={onBack} aria-label="뒤로" title="뒤로"><ArrowLeft size={19}/></button></div></header>
    <nav className="collection-tabs" aria-label="도감 분류">{[['ally', '동료'], ['enemy', '적군'], ['boss', '보스'], ['records', '지역·시스템']].map(([value, label]) => <button key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setSelected(null); setQuery(''); }}>{label}</button>)}</nav>
    {kind !== 'records' && <section className="collection-progress" aria-label="도감 수집 현황"><div><strong>{count}<small> / {group.length}</small></strong><span>{kind === 'ally' ? '영입한 동료' : '완료된 조사'}</span></div><progress value={count} max={group.length} aria-label="수집률"/><span>{Math.round(count / Math.max(1, group.length) * 100)}%</span></section>}
    <div className="collection-filters"><label className="collection-search"><Search size={18}/><input aria-label="도감 검색" placeholder="이름 또는 역할" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button aria-label="검색 지우기" title="검색 지우기" onClick={() => setQuery('')}><X size={17}/></button>}</label>
      {kind !== 'records' && <select aria-label="수집 상태" value={state} onChange={event => setState(event.target.value)}><option value="all">전체</option><option value="owned">수집 완료</option><option value="locked">미수집</option></select>}
    </div>
    {kind === 'records' ? <div className="collection-records">{recordList.map(item => <article key={item.id}><BookOpen size={23}/><div><small>{item.category}</small><h2>{item.unlocked ? item.title : '미조사 지역'}</h2><p>{item.unlocked ? item.desc : '해당 전장 클리어 시 기록'}</p></div></article>)}</div> : <div className="collection-grid">
      {visible.map(item => <button key={item.id} data-character={item.id} data-collected={item.unlocked} className={`collection-card ${item.unlocked ? 'collected' : 'uncollected'}`} aria-label={`${item.name} · ${item.status}`} onClick={() => setSelected(item.id)}>
        <span className="collection-number">{String(item.number).padStart(2, '0')}</span><span className="collection-mark" aria-hidden="true">{item.unlocked ? <Check size={16}/> : <Lock size={15}/>}</span>
        <div className="collection-art"><img src={item.art} className={item.unlocked ? '' : 'collection-monochrome'} alt="" loading="lazy" decoding="async" width="512" height="512"/></div>
        <div className="collection-caption"><small>{item.role}</small><strong>{item.name}</strong><span>{item.status}</span></div>
      </button>)}
    </div>}
    {(kind === 'records' ? !recordList.length : !visible.length) && <p className="collection-empty">조건에 맞는 기록이 없습니다.</p>}
    {entry && <CharacterDetail entry={entry} onClose={() => setSelected(null)}
      onPrevious={selectedIndex > 0 ? () => setSelected(visible[selectedIndex - 1].id) : null}
      onNext={selectedIndex < visible.length - 1 ? () => setSelected(visible[selectedIndex + 1].id) : null}/>}
  </main>;
}
