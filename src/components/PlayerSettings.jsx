import { useState } from 'react';
import { ArrowLeft, Volume2, Swords, Save, Download, Settings, Play, Upload, RotateCcw } from 'lucide-react';
import { PatchSettings } from './PatchUpdates.jsx';

const tabs = [['sound', '소리', Volume2], ['battle', '전투', Swords], ['save', '저장', Save], ['update', '업데이트', Download]];
function Toggle({ label, checked, onChange }) {
  return <label className="ux-setting-row"><span>{label}</span><input role="switch" type="checkbox" aria-label={label} checked={Boolean(checked)} onChange={event => onChange(event.target.checked)} /></label>;
}
function Choice({ label, value, options, onChange }) {
  return <fieldset className="ux-choice"><legend>{label}</legend><div>{options.map(option => <button key={option.id} aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}</button>)}</div></fieldset>;
}
export default function PlayerSettings({ initialTab = 'sound', version, settings, onSetting, onBack, options, onSound, slots,
  onSaveSlot, onLoadSlot, onSave, canSave, canCopyCheckpoint, onBackup, onExport, onClearSlots, onReset, onOpen, saveNotice }) {
  const [tab, setTab] = useState(initialTab);
  const change = key => value => onSetting(key, value);
  return <main className="player-settings ux-screen">
    <header className="ux-page-header"><div><small>천수 · v{version}</small><h1>설정</h1></div><button onClick={onBack}><ArrowLeft size={19} />뒤로</button></header>
    <nav className="ux-tabs" aria-label="설정 분류">{tabs.map(([id, title, Icon]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}><Icon size={18} />{title}</button>)}</nav>
    <div className="ux-settings-body">
      {tab === 'sound' && <section aria-label="소리 설정">
        <h2>소리</h2><Toggle label="사운드" checked={settings.soundOn} onChange={change('soundOn')} />
        <Toggle label="배경 음악" checked={settings.musicOn} onChange={change('musicOn')} />
        <label className="ux-volume"><span>전체 음량 <output>{settings.sfxVolume}%</output></span><input aria-label="전체 음량" type="range" min="0" max="100" step="5" value={settings.sfxVolume} onChange={event => onSetting('sfxVolume', Number(event.target.value))} /></label>
        <button onClick={() => onSound('confirm')}><Play size={18} />효과음 확인</button>
        <details className="ux-details"><summary>효과음 목록</summary><div className="ux-action-grid">{[['slash','검격'],['fire','화염'],['ice','빙결'],['heal','회복'],['boss','보스'],['victory','승리']].map(([id,label]) => <button key={id} onClick={() => onSound(id)}><Play size={15} />{label}</button>)}</div></details>
      </section>}
      {tab === 'battle' && <section aria-label="전투 설정"><h2>전투</h2>
        <Choice label="전투 속도" value={settings.battleSpeed} options={options.speed} onChange={change('battleSpeed')} />
        <Choice label="전투 컷씬" value={settings.cutsceneMode} options={options.cutscene} onChange={change('cutsceneMode')} />
        <Toggle label="전투 이펙트" checked={settings.effectsOn} onChange={change('effectsOn')} />
        <Toggle label="화면 흔들림" checked={settings.shakeOn} onChange={change('shakeOn')} />
        <Choice label="난이도" value={settings.difficulty} options={options.difficulty} onChange={change('difficulty')} />
        <details className="ux-details"><summary>세부 전투 설정</summary>
          <Choice label="밸런스 프리셋" value={settings.balancePreset} options={options.balance} onChange={change('balancePreset')} />
          <Choice label="자동 전투 성향" value={settings.autoBattleMode} options={options.auto} onChange={change('autoBattleMode')} />
          <Toggle label="자동 전투 스킬 사용" checked={settings.autoUseSkills} onChange={change('autoUseSkills')} />
          <Toggle label="아이템 제안" checked={settings.autoUseItems} onChange={change('autoUseItems')} />
          <Choice label="전투 로그" value={settings.logLines} options={[4,6,8].map(id => ({id,label:`${id}줄`}))} onChange={change('logLines')} />
        </details>
      </section>}
      {tab === 'save' && <section aria-label="저장 데이터 관리"><h2>저장 데이터</h2>
        <button className="ux-primary" disabled={!canSave} onClick={onSave}><Save size={18} />현재 상태 저장</button>
        <p className="ux-status" role="status">{saveNotice?.text || (!canSave ? '현재 진행 중인 여정이 없거나 저장할 수 없는 전투 상태입니다.' : '클리어한 진행은 자동으로 저장됩니다.')}</p>
        <div className="ux-save-slots">{slots.map(({ id, summary }) => <article key={id}><div><strong>슬롯 {id}</strong><span>{summary?.stage || '비어 있음'}</span><small>{summary?.dateText || ''}</small></div><div><button aria-label={`슬롯 ${id} 저장`} onClick={() => onSaveSlot(id)} disabled={!canSave && !canCopyCheckpoint}><Save size={17} />저장</button><button aria-label={`슬롯 ${id} 불러오기`} disabled={!summary?.ok} onClick={() => onLoadSlot(id)}><Upload size={17} />불러오기</button></div></article>)}</div>
        <div className="ux-action-grid"><button onClick={() => onBackup(false)}><RotateCcw size={17} />자동 백업 복구</button><button onClick={() => onBackup(true)}><RotateCcw size={17} />이전 저장 복구</button><button onClick={onExport}><Upload size={17} />저장 데이터 복사</button></div>
        <details className="ux-details ux-danger"><summary>저장 삭제</summary><button onClick={onClearSlots}>수동 슬롯 비우기</button><button onClick={onReset}>현재 저장 데이터 초기화</button></details>
      </section>}
      {tab === 'update' && <section aria-label="업데이트 설정"><PatchSettings />
        <details className="ux-details"><summary>사진 설정</summary><Choice label="포토 테마" value={settings.photoTheme} options={options.photo} onChange={change('photoTheme')} /><Toggle label="포토 모드 워터마크" checked={settings.photoWatermark} onChange={change('photoWatermark')} /></details>
        <details className="ux-details"><summary><Settings size={16} />개발 및 진단</summary><div className="ux-action-grid">{[['pwa','설치 점검'],['saveHealth','저장 점검'],['qa','QA 점검'],['analytics','플레이 기록 분석'],['finalRc','빌드 점검'],['release','출시 노트']].map(([id,label]) => <button key={id} onClick={() => onOpen(id)}>{label}</button>)}</div></details>
      </section>}
    </div>
  </main>;
}
