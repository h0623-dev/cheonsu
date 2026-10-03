import { useEffect, useRef, useState } from 'react';
import { Play, Plus, BookOpen, Settings, CircleHelp, ArrowRight, X, UserRound } from 'lucide-react';
import { PatchTitleStatus } from './PatchUpdates.jsx';

function NewJourneyDialog({ onConfirm, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog ref={ref} className="journey-confirm" aria-labelledby="new-journey-title" onCancel={onClose}>
    <header><h2 id="new-journey-title">새 여정을 시작할까요?</h2><button className="ux-icon" aria-label="닫기" onClick={onClose}><X size={20} /></button></header>
    <p>다음 저장부터 새 여정이 기록됩니다. 기존 저장은 지금 삭제되지 않습니다.</p>
    <footer><button autoFocus onClick={onClose}>돌아가기</button><button className="ux-primary" onClick={onConfirm}>새 여정 시작</button></footer>
  </dialog>;
}

export default function TitleMenu({ version, checkpoint, onNew, onContinue, onOpen, onHelp }) {
  const [confirm, setConfirm] = useState(false);
  const saved = checkpoint.data;
  return <main className="journey-title" aria-label="천수 메인 메뉴">
    <img className="journey-title-art" src="/art/journey-v1/title.webp" alt="카일, 브람, 리나, 아리아가 왕도로 이어진 길을 바라보고 있다" fetchPriority="high" />
    <div className="journey-title-content">
      <div className="journey-title-name"><p>천수 기사단의 여정</p><h1>천수</h1><span>꺼지지 않은 봉화</span></div>
      <div className="journey-title-actions">
        {saved && <button className="journey-resume ux-primary" aria-label="이어하기" onClick={onContinue}><Play size={23} /><span><strong>이어하기</strong><small>{saved.selectedStage?.title || '원정 준비'} · {saved.clearedStages.length}/30장 완료</small></span><ArrowRight size={21} /></button>}
        {checkpoint.exists && !saved && <button onClick={() => onOpen('settings', 'save')}><BookOpen size={20} />저장 복구</button>}
        <button className={saved ? 'journey-new' : 'journey-new ux-primary'} aria-label="새 게임" onClick={() => checkpoint.exists ? setConfirm(true) : onNew()}><Plus size={21} />새 게임</button>
        <nav aria-label="메인 메뉴"><button onClick={() => onOpen('library')}><BookOpen size={19} />기록실</button><button onClick={() => onOpen('codex')}><BookOpen size={19} />도감</button><button onClick={() => onOpen('settings')}><Settings size={19} />설정</button><button onClick={onHelp} aria-label="도움말" title="도움말"><CircleHelp size={19}/></button></nav>
        <button className="account-title-entry" onClick={() => onOpen('settings', 'account')}><UserRound size={18}/>계정 · Google 로그인</button>
      </div>
    </div>
    <footer className="journey-title-footer"><span>v{version}</span><PatchTitleStatus /></footer>
    {confirm && <NewJourneyDialog onClose={() => setConfirm(false)} onConfirm={onNew} />}
  </main>;
}
