import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Tent, Map } from 'lucide-react';

export default function DefeatDialog({ stageTitle, reason, onRetry, onCamp, onCampaign }) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current.open) ref.current.showModal(); }, []);
  return createPortal(<dialog ref={ref} className="world-item-dialog defeat-dialog" aria-labelledby="defeat-title" onCancel={event => event.preventDefault()}>
    <section className="world-item-sheet">
      <header><div><small>{stageTitle}</small><h2 id="defeat-title">전투 패배</h2></div></header>
      <div className="defeat-summary"><p>{reason}</p><span>전투 보상은 지급되지 않았습니다.</span></div>
      <div className="defeat-actions">
        <button onClick={onCamp}><Tent size={20} />대기실로 이동</button>
        <button onClick={onRetry}><RotateCcw size={20} />재도전</button>
        <button onClick={onCampaign}><Map size={20} />캠페인으로</button>
      </div>
    </section>
  </dialog>, document.body);
}
