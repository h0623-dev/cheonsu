import { Download, RefreshCw, CheckCircle, RotateCw } from 'lucide-react';
import { version } from '../../package.json';
import '../patch-updates.css';

export function PatchSettings({ patch }) {
  const busy = ['checking', 'downloading'].includes(patch.status);
  return <section className="settings-danger app-update-card patch-settings" aria-labelledby="patch-heading">
    <h2 id="patch-heading"><Download size={20} aria-hidden="true" /> 게임 업데이트</h2>
    <div className="setting-mini-info"><span>현재 버전</span><strong>v{version}</strong></div>
    <label className="patch-toggle"><span>패치 자동 다운로드</span><input type="checkbox" checked={patch.enabled}
      disabled={patch.status === 'web'} onChange={event => patch.manager.setEnabled(event.target.checked)} /></label>
    <div className={`update-status update-${patch.status}`} role="status">
      <strong>{patch.status === 'pending' ? '설치 준비 완료' : patch.status === 'downloading' ? '다운로드 중' : '패치 상태'}</strong>
      <span>{patch.message}</span>
      {patch.status === 'downloading' && <><progress max="100" value={patch.progress} aria-label="패치 다운로드 진행률" /><small>{patch.progress}% · {Math.ceil((patch.latest?.size || 0) / 1048576)} MB</small></>}
      {patch.latest?.notes?.length > 0 && <ul>{patch.latest.notes.map(note => <li key={note}>{note}</li>)}</ul>}
    </div>
    <div className="update-actions"><button disabled={busy || patch.status === 'web'} onClick={() => patch.manager.check({ manual: true })}>
      <RefreshCw size={17} aria-hidden="true" /> {patch.status === 'downloading' ? '다운로드 중' : busy ? '확인 중' : '패치 확인'}</button>
      {patch.status === 'native' && <a className="patch-apk-link" href={patch.latest.apkUrl} target="_blank" rel="noreferrer"><Download size={17} aria-hidden="true" /> 새 APK 받기</a>}
    </div>
  </section>;
}

export function PatchTitleStatus({ patch }) {
  if (!['downloading', 'pending', 'rollback', 'native'].includes(patch.status)) return null;
  return <div className="patch-title-status" role="status">
    {patch.status === 'pending' ? <CheckCircle size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
    <span>{patch.status === 'pending' ? `v${patch.latest.version} 패치 준비 완료` : patch.status === 'downloading' ? `패치 다운로드 ${patch.progress}%` : patch.message}</span>
    {patch.status === 'pending' && <button onClick={() => patch.manager.applyAtTitle()}><RotateCw size={17} aria-hidden="true" /> 지금 적용</button>}
  </div>;
}
