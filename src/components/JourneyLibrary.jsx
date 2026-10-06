import { useState } from 'react';
import { ArrowLeft, BookOpen, Users, Trophy, Images, ScrollText, Lock, Play, Check, UserRound, Map } from 'lucide-react';
import { stages } from '../data/stages.js';
import { STORY_ARCS, getStoryArcIndex } from '../data/storyScenes.js';
import { getChapterBrief } from '../data/chapterBriefs.js';
import { getWorldSceneThumbnail } from '../data/worldArt.js';
import { canReplayStory } from '../engine/playerExperience.js';

const records = [['roster','기사단',Users],['codex','도감',BookOpen],['records','전투 기록',ScrollText],['profile','지휘관',UserRound],['gallery','갤러리',Images],['hall','명예의 전당',Trophy],['planner','육성 계획',Map],['strategyArchive','전략 보관함',ScrollText]];
export default function JourneyLibrary({ cleared, onBack, onOpen, onReplay, sessionActive, checkpoint, onContinue }) {
  const [tab, setTab] = useState('story');
  const [act, setAct] = useState(() => getStoryArcIndex(Math.min(stages.length, Math.max(0, ...cleared) + 1)));
  return <main className="journey-library ux-screen">
    <header className="ux-page-header"><div><small>천수 기사단</small><h1>기록실</h1></div><button onClick={onBack}><ArrowLeft size={19}/>뒤로</button></header>
    <nav className="ux-tabs" aria-label="기록실 분류"><button aria-pressed={tab === 'story'} onClick={() => setTab('story')}><BookOpen size={18}/>이야기</button><button aria-pressed={tab === 'records'} onClick={() => setTab('records')}><ScrollText size={18}/>도감·기록</button></nav>
    {tab === 'records' ? <>
      {!sessionActive && <section className="library-checkpoint"><h2>{checkpoint ? '저장된 여정' : '새 여정'}</h2><p>{cleared.length}/{stages.length}장 완료{checkpoint ? ` · ${checkpoint.gold || 0}G` : ''}</p>{checkpoint && <button className="ux-primary" onClick={onContinue}><Play size={18}/>이어하기</button>}</section>}
      <div className="library-links">{records.filter(([id]) => sessionActive || ['roster','codex'].includes(id)).map(([id,label,Icon]) => <button key={id} onClick={() => onOpen(id)}><Icon size={22}/><span>{label}</span><span aria-hidden="true">›</span></button>)}</div>
    </> : <>
      <nav className="library-acts" aria-label="이야기 막">{STORY_ARCS.map((_,index) => <button key={index} aria-pressed={act === index} onClick={() => setAct(index)}>제{index + 1}막</button>)}</nav>
      <h2 className="library-act-title">{STORY_ARCS[act]}</h2>
      <div className="library-chapters">{stages.filter(stage => getStoryArcIndex(stage.id) === act).map(stage => {
        const intro = canReplayStory(stage.id, 'intro', cleared), clear = canReplayStory(stage.id, 'clear', cleared);
        return <article key={stage.id} className={intro ? '' : 'is-locked'}>
          <img src={getWorldSceneThumbnail(stage.id)} alt="" loading="lazy" decoding="async" width="480" height="320"/>
          <div><small>{clear ? <><Check size={14}/>완료</> : intro ? '진행 가능' : <><Lock size={14}/>미개방</>}</small><h3>{stage.title}</h3><p>{intro ? getChapterBrief(stage.id)?.text : '앞선 장을 완료하면 이야기가 열립니다.'}</p>
            <div className="library-replay-actions"><button disabled={!intro} onClick={() => onReplay(stage, 'intro')} aria-label={`${stage.id}장 전투 전 이야기`}><Play size={15}/>전투 전</button><button disabled={!clear} onClick={() => onReplay(stage, 'clear')} aria-label={`${stage.id}장 전투 후 이야기`}><Play size={15}/>전투 후</button></div>
          </div>
        </article>;
      })}</div>
    </>}
  </main>;
}
