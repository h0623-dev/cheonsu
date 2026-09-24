import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Package } from 'lucide-react';

export default function ItemDialog({ items, onUse, onClose }) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current.open) ref.current.showModal(); }, []);
  return createPortal(
    <dialog ref={ref} className="world-item-dialog" aria-labelledby="item-dialog-title" onClose={onClose}
      onCancel={(event) => { event.preventDefault(); ref.current.close(); }}
      onClick={(event) => { if (event.target === ref.current) ref.current.close(); }}>
      <section className="world-item-sheet">
        <header><h2 id="item-dialog-title"><Package size={20} /> 아이템</h2><button type="button" className="icon-button" aria-label="아이템 닫기" title="닫기" onClick={() => ref.current.close()}><X size={22} /></button></header>
        <div className="world-item-list">
          {items.map(item => <button type="button" key={item.id} disabled={item.count <= 0} onClick={() => onUse(item.id)}>
            <span><strong>{item.name}</strong><small>{item.desc}</small></span><b>{item.count}개</b>
          </button>)}
        </div>
        <footer><button type="button" onClick={() => ref.current.close()}>취소</button></footer>
      </section>
    </dialog>, document.body,
  );
}
