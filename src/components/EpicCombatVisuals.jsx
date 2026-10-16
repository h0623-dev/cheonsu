import { useId } from 'react';

export default function EpicCombatVisuals() {
  return <>
    <div className="epic-combat-ground" aria-hidden="true" />
    <div className="epic-contact-light" aria-hidden="true" />
    <div className="epic-floor-pressure" aria-hidden="true" />
    <div className="epic-hit-flare" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => <i key={index} className="epic-flare-ray" style={{ '--epic-ray': index }} />)}
    </div>
    <div className="epic-debris-field" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => <i key={index} className="epic-debris" data-epic-debris={index} style={{ '--epic-piece': index }} />)}
    </div>
    <svg className="epic-strike-ribbon" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path className="epic-strike-edge" d="M0 0 Q50 0 100 0" fill="none" />
      <path className="epic-strike-core" d="M0 0 Q50 0 100 0" fill="none" />
      <path className="epic-strike-filament" d="M0 0 Q50 0 100 0" fill="none" />
    </svg>
  </>;
}

export function EpicCombatCutIn({ art, label, name }) {
  const clipId = `epic-cut-in-${useId().replace(/:/g, '')}`;
  return <div className="skill-cut-in epic-cut-in" data-epic-art={art.kind} aria-hidden="true">
    {art.crop ? <svg className="epic-cut-in-art" viewBox={art.crop.join(' ')} preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs><clipPath id={clipId}><rect x={art.crop[0]} y={art.crop[1]} width={art.crop[2]} height={art.crop[3]} /></clipPath></defs>
      <image href={art.src} width={art.width} height={art.height} clipPath={`url(#${clipId})`} />
    </svg> : <img className="epic-cut-in-art" src={art.src} alt="" draggable="false" />}
    <div className="epic-cut-in-copy"><small>{label}</small><strong>{name}</strong></div>
  </div>;
}
