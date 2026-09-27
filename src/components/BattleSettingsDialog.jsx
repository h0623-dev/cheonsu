import { useEffect, useRef } from 'react';

export default function BattleSettingsDialog({ children, onClose }) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current.open) ref.current.showModal(); }, []);
  return <dialog ref={ref} className="battle-settings-popover" aria-label="전투 설정" onClose={onClose}
    onCancel={event => { event.preventDefault(); ref.current.close(); }}
    onClick={event => { if (event.target === ref.current) ref.current.close(); }}>
    {children}
  </dialog>;
}
