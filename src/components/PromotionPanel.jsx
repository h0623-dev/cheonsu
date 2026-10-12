import { useRef, useState } from 'react';
import { DISCOVERIES, DISCOVERY_TECHNIQUES } from '../data/discoveries.js';
import { getSkill, skillDescription } from '../data/skills.js';
import { getPaintedVisualProfile } from '../data/unitVisuals.js';
import { canPromoteUnit, getOrdinaryPromotionPreview, getPromotionCost, getPromotionTitle } from '../engine/ordinaryPromotion.js';
import { canSecretPromote, getSecretPromotion, getSecretPromotionPreview } from '../engine/discoveryEngine.js';
import {
  ADVANCED_PROMOTION_GATE, ADVANCED_PROMOTION_MASTERY, ADVANCED_CHANGE_COST,
  canAdvancedPromote, getAdvancedMastery, getAdvancedPromotionForms,
  getAdvancedPromotionPreview, getAdvancedSealBalance,
} from '../engine/promotionEngine.js';
import './advanced-promotion.css';

const statLabels = [['hp', '최대 HP'], ['atk', '공격'], ['def', '방어'], ['move', '이동']];

function skillReachText(skill) {
  const maximum = skill.range ?? skill.radius ?? 0;
  const minimum = maximum === 0 ? 0 : skill.minRange ?? (skill.type === 'attack' ? 1 : 0);
  return `사거리 ${minimum === maximum ? maximum : `${minimum}~${maximum}`}칸 · 재사용 대기 ${skill.cooldown || 0}턴`;
}

function PromotionStats({ preview, label }) {
  if (!preview) return null;
  return <div className="promotion-stat-preview promotion-comparison" aria-label={`${label} 능력치 비교`}>
    {statLabels.map(([key, name]) => <div key={key}>
      <span>{name}</span>
      <strong>{preview.before[key]} <span aria-hidden="true">→</span> {preview.after[key]}</strong>
      <small className={preview.delta[key] > 0 ? 'stat-increase' : preview.delta[key] < 0 ? 'stat-decrease' : ''}>
        {preview.delta[key] === 0 ? '변화 없음' : `${preview.delta[key] > 0 ? '+' : ''}${preview.delta[key]}`}
      </small>
    </div>)}
  </div>;
}

function Requirement({ met, children }) {
  return <span className={`promotion-requirement ${met ? 'met' : ''}`}>
    <span aria-hidden="true">{met ? '✓' : '○'}</span> {children}
  </span>;
}

export default function PromotionPanel({
  party = [], clearedStages = [], gold = 0, exploration, unitBattleStats = {},
  getPortrait, getDisplayClass, onOrdinaryPromote, onSecretPromote,
  onAdvancedPromote, onClose, message,
}) {
  const [selectedUnitId, setSelectedUnitId] = useState(party[0]?.id);
  const [previewId, setPreviewId] = useState(null);
  const detailsRef = useRef(null);
  const unit = party.find(candidate => candidate.id === selectedUnitId) || party[0];
  const seals = getAdvancedSealBalance(party, clearedStages);
  const ordinaryCheck = canPromoteUnit(unit, gold);
  const secret = getSecretPromotion(unit, exploration);
  const secretCheck = canSecretPromote(unit, exploration);
  const relicDiscovery = secret && DISCOVERIES.find(discovery => discovery.reward.relicId === secret.relicId);
  const secretTechnique = secret && DISCOVERY_TECHNIQUES[secret.techniqueId];
  const secretSkill = secretTechnique && getSkill({ ...unit, promoted: true, secretClass: secret.secretClass }, secret.techniqueId);
  const forms = getAdvancedPromotionForms(unit);
  const mastery = getAdvancedMastery(unit, unitBattleStats[unit?.id]);

  const selectUnit = id => {
    setSelectedUnitId(id);
    setPreviewId(null);
    if (detailsRef.current) detailsRef.current.scrollTop = 0;
  };

  return <div className="battle-card equipment-card promotion-card promotion-panel">
    <header className="promotion-panel-header">
      <div className="battle-title">전직</div>
      <strong>{gold.toLocaleString()}G · 전직인장 {seals.available}개</strong>
    </header>
    <p className="result-sub">동료를 선택하고 능력치와 기술을 비교하세요. 장비·장비 강화·성장·습득 기술은 유지됩니다.</p>

    <div className="promotion-unit-picker" role="group" aria-label="전직할 동료 선택">
      {party.map(member => <button key={member.id} type="button" data-promotion-unit={member.id}
        aria-pressed={unit?.id === member.id} aria-label={`${member.name} 전직 정보`}
        onClick={() => selectUnit(member.id)}>
        <img src={getPortrait(member)} alt="" loading="lazy" />
        <strong>{member.name}</strong>
        <small>Lv.{member.level || 1} · {member.advancedClass ? '최상위' : member.secretClass ? '비전' : member.promoted ? '상급' : '기본'}</small>
      </button>)}
    </div>

    <div ref={detailsRef} className="promotion-list" tabIndex={0} aria-label="선택한 동료의 전직 정보">
      {unit ? <div className={`promotion-entry ${unit.promoted ? 'promoted' : ''}`} key={unit.id}>
        <div className="promotion-unit-head">
          <img src={getPortrait(unit)} alt={unit.name} />
          <div><strong>{unit.name} Lv.{unit.level || 1}</strong><span>현재 병과 · {getDisplayClass(unit)}</span></div>
        </div>

        <section className="promotion-route" aria-label="상급 전직">
          <div className="promotion-route-heading"><h3>상급 전직 · {getPromotionTitle(unit)}</h3><span>{unit.promoted ? '완료' : '첫 전직'}</span></div>
          <p>Lv.3부터 선택할 수 있습니다. 최대 HP +5 · 공격 +2 · 방어 +2 · 공격 기술 위력 +1.</p>
          <PromotionStats preview={getOrdinaryPromotionPreview(unit)} label="상급 전직" />
          <div className="promotion-footer">
            <span>{unit.promoted ? '상급 전직 보정이 이미 적용되어 있습니다.' : `${getPromotionCost(unit)}G · ${ordinaryCheck.reason}`}</span>
            <button type="button" data-ordinary-promote={unit.id} disabled={!ordinaryCheck.ok} onClick={() => onOrdinaryPromote(unit.id)}>{unit.promoted ? '전직 완료' : '상급 전직'}</button>
          </div>
        </section>

        {secret && <section className="promotion-route promotion-secret-route" aria-label="비전 전직">
          <div className="promotion-route-heading"><h3>비전 전직 · {secret.classTitle}</h3><span>{unit.secretClass ? '완료' : '유물 전직'}</span></div>
          <div className="promotion-requirements">
            <Requirement met={unit.level >= secret.requiredLevel}>Lv.{secret.requiredLevel} 이상</Requirement>
            <Requirement met={secret.hasRelic || Boolean(unit.secretClass)}>{unit.secretClass ? '유물 사용 완료' : '전용 유물 보유'}</Requirement>
          </div>
          {relicDiscovery && <p className="promotion-relic-hint">유물 획득: {relicDiscovery.stageId}장 탐색 지점 「{relicDiscovery.title}」<br />{relicDiscovery.hint}</p>}
          {secretSkill && <p><strong>전용 기술 · {secretSkill.name}</strong><br />{skillDescription(secretSkill, unit.skillLevel || 0)}<br />{skillReachText(secretSkill)}</p>}
          <PromotionStats preview={getSecretPromotionPreview(unit, exploration)} label="비전 전직" />
          {!unit.promoted && <p className="promotion-preserve-note">바로 비전 전직하면 상급 전직의 능력치 보정도 함께 적용됩니다.</p>}
          {unit.advancedClass && <p className="promotion-preserve-note">현재 최상위 전직 분기를 유지하면서 비전 능력치와 기술을 추가합니다.</p>}
          <div className="promotion-footer">
            <span>{unit.secretClass ? '전용 기술과 능력치가 적용되어 있습니다.' : `유물 1개 사용 · 골드 무료. ${secretCheck.reason}`}</span>
            <button type="button" data-secret-promote={unit.id} disabled={!secretCheck.ok} onClick={() => onSecretPromote(unit.id)}>{unit.secretClass ? '전직 완료' : '비전 전직'}</button>
          </div>
        </section>}

        {forms.length > 0 && <section className="advanced-promotion" data-advanced-unit={unit.id} aria-label="최상위 전직">
          <div className="advanced-promotion-heading"><h3>최상위 전직 · 두 가지 길</h3><span>스킬 숙련 {mastery}/{ADVANCED_PROMOTION_MASTERY}</span></div>
          <div className="promotion-requirements">
            <Requirement met={clearedStages.includes(ADVANCED_PROMOTION_GATE)}>{ADVANCED_PROMOTION_GATE}장 클리어</Requirement>
            <Requirement met={Boolean(unit.promoted)}>상급 또는 비전 전직</Requirement>
            <Requirement met={mastery >= ADVANCED_PROMOTION_MASTERY || Boolean(unit.advancedClass)}>스킬 사용 {ADVANCED_PROMOTION_MASTERY}회</Requirement>
          </div>
          <details className="advanced-promotion-summary" data-advanced-seals={seals.available}>
            <summary>전직인장 {seals.available}개 · 획득 방법과 분기 변경 비용</summary>
            <p>{ADVANCED_PROMOTION_GATE}장 첫 승리에 인장 3개, 32~50장 첫 승리마다 1개를 받습니다. 동료마다 최초 최상위 전직에 1개가 필요합니다.</p>
            <p>첫 분기 변경은 무료, 이후에는 {ADVANCED_CHANGE_COST}G입니다. 분기를 바꾸면 현재 분기의 능력치를 새 분기의 능력치로 교체합니다. 현재 HP를 회복하지 않습니다.</p>
          </details>
          <div className="advanced-promotion-forms">
            {forms.map(form => {
              const check = canAdvancedPromote(unit, form.id, { party, clearedStages, gold, mastery });
              const current = unit.advancedClass === form.id;
              const opened = previewId === form.id;
              const art = getPaintedVisualProfile(form.id)?.battle || getPortrait(unit);
              const nextSkill = getSkill({ ...unit, promoted: true, advancedClass: form.id }, form.skill.id) || form.skill;
              return <article key={form.id} data-advanced-form={form.id} className={`advanced-promotion-form ${current ? 'current' : ''} ${opened ? 'previewing' : ''}`}>
                <img src={art} alt={`${unit.name} ${form.name} 전투 모습`} loading="lazy" />
                <strong>{form.name}{current ? ' · 선택 중' : ''}</strong>
                <span className="advanced-form-role">{form.role}</span>
                <p><b>{form.skill.name}</b><br />{skillDescription(nextSkill, unit.skillLevel || 0)}<br />{skillReachText(nextSkill)}</p>
                <PromotionStats preview={getAdvancedPromotionPreview(unit, form.id)} label={form.name} />
                <p className="advanced-form-drawback">대가·약점: {form.drawback}</p>
                <button type="button" className="advanced-preview-button" data-advanced-preview={form.id} aria-expanded={opened}
                  aria-controls={`promotion-details-${form.id}`} onClick={() => setPreviewId(opened ? null : form.id)}>{opened ? '외형 설명 접기' : '외형 설명 보기'}</button>
                {opened && <div className="advanced-form-details" id={`promotion-details-${form.id}`}><p>{form.appearance}</p><p>기존 기술을 유지하며 {form.skill.name}을 새로 사용할 수 있습니다.</p></div>}
                <small className="advanced-promotion-reason">{check.reason}</small>
                <button type="button" data-advanced-select={form.id} disabled={!check.ok} onClick={() => onAdvancedPromote(unit.id, form.id)}>{current ? '현재 전직' : unit.advancedClass ? '이 분기로 변경' : '이 전직 선택'}</button>
              </article>;
            })}
          </div>
        </section>}
      </div> : <p className="promotion-empty">전직할 동료가 없습니다.</p>}
    </div>

    {message && <p className="promotion-result-message" role="status">{message}</p>}
    <button type="button" className="result-btn second" onClick={onClose}>닫기</button>
  </div>;
}
