import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Flag, ShieldAlert, Swords } from 'lucide-react';
import { getStageMission } from '../engine/stageMission.js';
import './stage-mission.css';

function MissionConditions({ mission }) {
  return <div className="stage-mission-conditions">
    <section className="stage-mission-victory" aria-label="승리 미션">
      <h3><Swords size={18} aria-hidden="true" />승리 미션</h3>
      <ul>{mission.victoryConditions.map(condition => <li key={condition.id}>{condition.text}</li>)}</ul>
      <p>{mission.victoryConditions.length > 1 ? '위 조건 중 하나를 달성하면 승리합니다.' : '위 조건을 달성하면 승리합니다.'}</p>
    </section>
    <section className="stage-mission-defeat" aria-label="패배 미션">
      <h3><ShieldAlert size={18} aria-hidden="true" />패배 미션</h3>
      <ul>{mission.defeatConditions.map(condition => <li key={condition.id}>{condition.text}</li>)}</ul>
      <p>위 조건 중 하나라도 발생하면 패배합니다.</p>
    </section>
  </div>;
}

export function StageMissionCard({ stage }) {
  if (!stage) return null;
  return <section className="stage-mission-card" aria-label="스테이지 미션" data-mission-context="deployment" data-mission-stage={stage.id} lang="ko">
    <header><Flag size={18} aria-hidden="true" /><h2>스테이지 미션</h2></header>
    <MissionConditions mission={getStageMission(stage)} />
  </section>;
}

export function StageMissionDialog({ stage, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return createPortal(<dialog ref={ref} className="stage-mission-dialog" aria-labelledby="stage-mission-title"
    data-mission-context="battle" data-mission-stage={stage.id} lang="ko"
    onCancel={event => { event.preventDefault(); onConfirm(); }}>
    <header><Flag size={24} aria-hidden="true" /><div><small>{stage.title}</small><h2 id="stage-mission-title">스테이지 미션</h2></div></header>
    <div className="stage-mission-body"><MissionConditions mission={getStageMission(stage)} /></div>
    <footer><button type="button" autoFocus onClick={onConfirm}>미션 확인</button></footer>
  </dialog>, document.body);
}
