import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Tent, ShoppingBag, Trophy } from 'lucide-react';
import './VictoryDialog.css';

export default function VictoryDialog({ title, summary, reward, loot, mvp, hasNext, onContinue, saveNotice, replay, onRetrySave }) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current.open) ref.current.showModal(); }, []);
  return createPortal(<dialog ref={ref} className="victory-dialog" aria-labelledby="victory-title" onCancel={event => event.preventDefault()}>
    <header><Trophy size={26} /><div><small>{title}</small><h2 id="victory-title">전투 승리</h2></div><b className="victory-rank">{summary?.rank || 'CLEAR'}</b></header>
    <div className="victory-body">
      <p className={saveNotice?.ok ? 'clear-save-ok' : 'clear-save-pending'} role="status">{saveNotice?.text || '클리어 기록 저장 중'}</p>
      {saveNotice && !saveNotice.ok && <button onClick={onRetrySave}>자동저장 재시도</button>}
      {replay && <p>재도전 · 전투 경험치 획득</p>}
      <p>{summary?.round || 1}턴 · 아군 {summary?.aliveAllies || 0}명 생존</p>
      <dl><div><dt>획득 골드</dt><dd>{reward.gold} G</dd></div><div><dt>회복약</dt><dd>{reward.potion}개</dd></div></dl>
      {mvp && <p className="victory-mvp">MVP <strong>{mvp.unit.name}</strong></p>}
      <details><summary>전투 상세</summary>
        {summary?.missionOrder && <p>{summary.missionOrder.title}</p>}
        {summary?.tacticalGoals?.map(goal => <p key={goal.id}>{goal.met ? '달성' : '미달성'} · {goal.title}</p>)}
        {loot && <p>전리품: {loot}</p>}
      </details>
    </div>
    <footer>
      {hasNext && <button className="victory-next" onClick={() => onContinue('next')}><ArrowRight size={18} />다음 스테이지</button>}
      <button onClick={() => onContinue('shop')}><ShoppingBag size={18} />상점</button>
      <button onClick={() => onContinue('camp')}><Tent size={18} />대기실</button>
    </footer>
  </dialog>, document.body);
}
