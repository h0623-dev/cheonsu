import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, SkipForward, X, Play, Pause } from 'lucide-react';
import { STORY_ARCS, getStoryArcIndex } from '../data/storyScenes.js';
import { getCharacterProfile } from '../data/characterProfiles.js';
import { storySpeakerKeys } from '../data/storyArt.js';
import { getStoryReadDelay } from '../engine/playerExperience.js';

export default function StoryScene({ scene, background, portrait, onNext, onPrevious, onSkip }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const root = useRef(null);
  const history = useRef(null);
  const line = scene.lines[scene.index];
  const last = scene.index === scene.lines.length - 1;
  const profile = getCharacterProfile(storySpeakerKeys[line.speaker]);
  const advance = useEffectEvent(onNext);
  useEffect(() => {
    if (!automatic || historyOpen || document.hidden) return;
    const timer = setTimeout(() => advance(), getStoryReadDelay(line.text));
    return () => clearTimeout(timer);
  }, [automatic, historyOpen, line.text, scene.index, scene.stage.id]);
  useEffect(() => {
    const hide = () => { if (document.hidden) setAutomatic(false); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  useEffect(() => { root.current?.focus(); }, []);
  useEffect(() => { if (historyOpen && !history.current.open) history.current.showModal(); }, [historyOpen]);
  return (
    <section className={`story-screen narrative-stage story-${scene.type}`} ref={root} tabIndex={-1}
      aria-label={`${scene.stage.title} 이야기`} onKeyDown={event => {
        if (historyOpen || event.target !== event.currentTarget) return;
        if (['Enter', ' ', 'ArrowRight'].includes(event.key)) { event.preventDefault(); onNext(); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); onPrevious(); }
      }}>
      <img className="narrative-background" src={background} alt="" />
      <header className="narrative-header">
        <div><small>{STORY_ARCS[getStoryArcIndex(scene.stage.id)]} · {scene.type === 'intro' ? '전투 전' : '전투 후'}</small>
          <h1>{scene.stage.title}</h1></div>
        <button className="narrative-skip" onClick={onSkip}><SkipForward size={17} />{scene.onComplete === 'library' ? '기록실로' : scene.onComplete === 'battle' ? '바로 전투' : '건너뛰기'}</button>
      </header>
      <div className="narrative-actor" key={line.speaker}><img src={portrait} alt={line.speaker} /></div>
      <div className="narrative-dialogue">
        <div className="narrative-speaker"><div><small className="narrative-role">{profile.role}</small><strong>{line.speaker}</strong></div>
          <button className="narrative-auto" aria-label={automatic ? '자동 진행 중지' : '자동 진행'} aria-pressed={automatic} title={automatic ? '자동 진행 중지' : '자동 진행'} onClick={() => setAutomatic(!automatic)}>{automatic ? <Pause size={17}/> : <Play size={17}/>}자동</button>
          <button className="icon-button" aria-label="대화 기록" title="대화 기록" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}><BookOpen size={20} /></button></div>
        <p className="narrative-line" aria-live="polite">{line.text}</p>
        <footer>
          <button className="icon-button" onClick={onPrevious} disabled={scene.index === 0} aria-label="이전 대사" title="이전 대사"><ArrowLeft size={20} /></button>
          <span className="narrative-progress" aria-label={`대사 ${scene.index + 1} / ${scene.lines.length}`}>{scene.index + 1} / {scene.lines.length}</span>
          <button className="narrative-next" onClick={onNext}>{last ? scene.onComplete === 'library' ? '기록실로' : '계속' : '다음'}<ArrowRight size={18} /></button>
        </footer>
      </div>
      {historyOpen && <dialog ref={history} className="narrative-history" aria-label="지나온 대화" onCancel={() => setHistoryOpen(false)}>
        <header><h2>대화 기록</h2><button className="icon-button" aria-label="대화 기록 닫기" title="닫기" onClick={() => setHistoryOpen(false)}><X size={20} /></button></header>
        <ol>{scene.lines.slice(0, scene.index + 1).map((entry, index) => <li key={index}><strong>{entry.speaker}</strong><p>{entry.text}</p></li>)}</ol>
      </dialog>}
    </section>
  );
}
