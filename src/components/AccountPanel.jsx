import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { UserRound, LogOut, Trash2, ShieldCheck, ExternalLink, X } from 'lucide-react';
import { accountManager } from '../engine/accountRuntime.js';
import config from '../data/accountConfig.json';
import './account.css';

function DeleteAccountDialog({ busy, onConfirm, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog ref={ref} className="account-delete-dialog" aria-labelledby="delete-account-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <header><h2 id="delete-account-title">천수 계정 삭제</h2><button disabled={busy} aria-label="닫기" onClick={onClose}><X size={20}/></button></header>
    <p>천수의 로그인 계정과 프로필을 영구 삭제합니다. Google 계정 자체는 삭제되지 않습니다.</p>
    <p>이 기기에 저장된 캐릭터와 진행도는 남습니다. 기기 저장은 설정의 저장 탭에서 별도로 삭제할 수 있습니다.</p>
    <footer><button disabled={busy} autoFocus onClick={onClose}>취소</button><button className="account-danger" disabled={busy} onClick={onConfirm}>{busy ? '처리 중…' : '계정 영구 삭제'}</button></footer>
  </dialog>;
}

export default function AccountPanel() {
  const account = useSyncExternalStore(accountManager.subscribe, accountManager.getState);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { void accountManager.init(); }, []);
  const disabled = account.busy || !account.ready;
  return <section className="account-panel" aria-label="계정 관리" aria-busy={account.busy}>
    <h2>계정</h2>
    <div className="account-identity"><UserRound size={32}/><div><strong>{account.user?.displayName || '게스트'}</strong><span>{account.user?.email || '기기에 저장된 여정'}</span></div><span className="account-state">{account.user ? '로그인됨' : '로그아웃'}</span></div>
    {!account.user ? <button className="google-sign-in" disabled={disabled || !account.available} onClick={() => accountManager.run('signIn')}><img src="/brand/google-g.png" width="20" height="20" alt=""/>Google로 로그인</button> :
      <button disabled={disabled} onClick={() => accountManager.run('signOut')}><LogOut size={18}/>로그아웃</button>}
    {!account.available && <p className="ux-status">Google 로그인 연결 준비 중</p>}
    <p className="account-local-note"><ShieldCheck size={18}/><span>플레이 기록은 이 기기에 저장됩니다. 로그인만으로 다른 기기에 동기화되지는 않습니다.</span></p>
    <p className="ux-status" role="status">{account.message}</p>
    <div className="account-legal"><a href={config.privacyUrl || '/legal/privacy.html'} target="_blank" rel="noopener noreferrer">개인정보 처리방침 <ExternalLink size={14}/></a><a href={config.deletionUrl || '/legal/account-deletion.html'} target="_blank" rel="noopener noreferrer">계정 삭제 안내 <ExternalLink size={14}/></a></div>
    {account.user && <button disabled={disabled} className="account-danger" onClick={() => setDeleting(true)}><Trash2 size={17}/>계정 삭제</button>}
    {deleting && <DeleteAccountDialog busy={account.busy} onClose={() => setDeleting(false)} onConfirm={async () => { await accountManager.run('delete'); setDeleting(false); }}/>}
  </section>;
}
