import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function PromotionDialog({ children, onClose }) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current.open) ref.current.showModal(); }, []);
  return createPortal(<dialog ref={ref} className="promotion-dialog" aria-label="전직" onClose={onClose}
    onCancel={event => { event.preventDefault(); ref.current.close(); }}
    onClick={event => { if (event.target === ref.current) ref.current.close(); }}>
    {children}
  </dialog>, document.body);
}
