import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Check, Sparkles, X } from 'lucide-react';
import { DISCOVERY_TECHNIQUES, SECRET_PROMOTIONS } from '../data/discoveries.js';

const kindLabels = { training: '수련의 흔적', technique: '비전 기록', relic: '전직 보물' };
const artwork = kind => `/art/world-v2/props/${kind === 'relic' ? 'crystal' : kind === 'technique' ? 'monument' : 'crates'}.webp`;
function rewardText(entry) {
  const reward = entry.reward;
  if (reward.xp) return `발견한 동료 EXP +${reward.xp}`;
  if (reward.techniqueId) return `${DISCOVERY_TECHNIQUES[reward.techniqueId].name} 해금`;
  return `${SECRET_PROMOTIONS[reward.unitId].classTitle}의 전직 보물`;
}

export default function DiscoveryDialog({ receipt, progress, entries, onClose }) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current.open) ref.current.showModal(); }, []);
  return createPortal(<dialog ref={ref} className="discovery-dialog" aria-labelledby="discovery-title" onClose={onClose}
    onCancel={event => { event.preventDefault(); ref.current.close(); }}
    onClick={event => { if (event.target === ref.current) ref.current.close(); }}>
    <header><h2 id="discovery-title">{receipt ? <Sparkles size={20} /> : <BookOpen size={20} />}{receipt ? '새로운 발견' : '탐색 기록'}</h2>
      <button aria-label="탐색 창 닫기" title="닫기" onClick={() => ref.current.close()}><X size={22} /></button></header>
    {receipt ? <section className="discovery-receipt">
      <img src={artwork(receipt.kind)} alt="" /><span>{kindLabels[receipt.kind]}</span>
      <h3>{receipt.title}</h3><p>{receipt.hint}</p><strong>{receipt.message}</strong>
      {receipt.kind === 'relic' && <small>야영진 · 전직 · Lv.5</small>}
      {receipt.growth?.map(message => <small key={message}>{message}</small>)}
    </section> : <div className="discovery-journal">
      <div className="discovery-count">발견 {progress.claimed.length} · 보유 전직 보물 {progress.relics.length} · 비전 {progress.techniques.length}</div>
      {entries.map(entry => {
        const claimed = progress.claimed.includes(entry.id);
        return <article key={entry.id} className={claimed ? 'claimed' : ''}>
          <img src={artwork(entry.kind)} alt="" /><div><small>{entry.stageId}장 · {kindLabels[entry.kind]} {claimed && <Check size={14} aria-label="발견 완료" />}</small>
            <h3>{claimed ? entry.title : '남겨진 단서'}</h3><p>{entry.hint}</p>
            {claimed && <strong>{rewardText(entry)}</strong>}</div>
        </article>;
      })}
      {!entries.length && <p>아직 전해진 단서가 없습니다.</p>}
    </div>}
    <footer><button onClick={() => ref.current.close()}>{receipt ? '계속' : '닫기'}</button></footer>
  </dialog>, document.body);
}
