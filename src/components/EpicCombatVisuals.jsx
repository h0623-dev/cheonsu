import { useId } from 'react';
import { getCinematicEnvironment } from '../data/cinematicEnvironment.js';
import './cinematic-environment.css';

export default function EpicCombatVisuals() {
  return <>
    <div className="epic-combat-ground" aria-hidden="true" />
    <div className="cinematic-impact-light" aria-hidden="true" />
    <svg className="cinematic-ground-wave" viewBox="0 0 200 200" aria-hidden="true">
      <ellipse cx="100" cy="100" rx="86" ry="30" fill="none" className="cinematic-wave-outer" />
      <ellipse cx="100" cy="100" rx="63" ry="21" fill="none" className="cinematic-wave-inner" />
      <path d="M18 100Q43 77 67 88M133 112Q158 123 182 100" fill="none" className="cinematic-wave-spray" />
    </svg>
    <svg className="cinematic-contact-cracks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path className="cinematic-crack-line" d="M50 50L40 55M50 50L60 55" fill="none" />
    </svg>
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

function ForegroundTerrain({ ground }) {
  if (ground === 'grass') return <>
    <path d="M0 220V128Q26 156 36 191Q31 145 57 112Q51 170 71 204Q79 153 108 141Q83 190 99 220ZM1000 220V146Q979 174 965 208Q970 153 944 130Q953 180 928 220Z" />
    <path d="M0 220V185Q34 171 69 199Q95 178 131 209L153 220ZM1000 220V189Q963 180 932 201Q911 186 882 214L865 220Z" opacity=".65" />
  </>;
  if (ground === 'ice') return <>
    <path d="M0 220V179L27 162 39 188 64 152 87 195 118 202 139 220ZM1000 220V170L975 182 962 151 940 195 914 206 895 220Z" />
    <path d="M6 198L26 173 35 195M53 190L64 163 79 199M945 201L962 165 969 190" className="cinematic-edge-highlight" fill="none" />
  </>;
  return <>
    <path d="M0 220V185L29 173 61 189 78 214 104 206 124 220ZM1000 220V183L974 170 950 190 940 210 917 203 896 220Z" />
    <path d="M0 188L29 178 59 194M976 176L952 193M82 215L104 210" className="cinematic-edge-highlight" fill="none" />
  </>;
}

// These planes contain only light, air and small edge silhouettes. The chapter
// painting stays a single arena background instead of being tiled or duplicated.
export function CinematicEnvironment({ stageId, background }) {
  const environment = getCinematicEnvironment(stageId, background);
  const data = { 'data-cinematic-biome': environment.biome, 'data-cinematic-weather': environment.weather, 'data-cinematic-ground': environment.ground };
  return <>
    <div className="cinematic-atmosphere" data-cinematic-layer="atmosphere" {...data} style={environment.style} aria-hidden="true">
      <div className="cinematic-horizon-glow" />
      <svg className="cinematic-light-shafts" viewBox="0 0 1000 600" preserveAspectRatio="none">
        <path d="M178 0H220L457 600H242Z" />
        <path d="M267 0H281L591 600H515Z" opacity=".55" />
        <path d="M724 0H747L617 600H495Z" opacity=".65" />
      </svg>
      <div className="cinematic-haze" />
      <div className="cinematic-motes">{environment.motes.map((mote, index) => <i key={index} data-cinematic-mote={index} data-cinematic-depth={mote.depth} style={{ left: `${mote.x}%`, top: `${mote.y}%`, '--cinematic-mote-size': `${mote.size}px` }} />)}</div>
    </div>
    <div className="cinematic-ground-bed" data-cinematic-layer="ground" {...data} style={environment.style} aria-hidden="true">
      <div className="cinematic-ground-haze" />
      <svg className="cinematic-ground-grain" viewBox="0 0 1000 160" preserveAspectRatio="none">
        <path d="M58 129 102 123M184 145 226 138M778 141 834 145M898 113 935 120M318 152 337 151M657 148 682 146" />
        {['wet', 'ice'].includes(environment.ground) && <path className="cinematic-water-sheen" d="M49 115Q130 98 211 115M736 127Q831 108 932 128M238 146Q332 134 421 146M578 151Q634 142 708 151" />}
        {environment.ground === 'rune' && <path className="cinematic-rune-inlay" d="M78 143 118 132 159 143M837 143 877 132 918 143M112 136V148M871 136V148" />}
      </svg>
    </div>
    <svg className="cinematic-foreground" data-cinematic-layer="foreground" {...data} style={environment.style} viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true">
      <ForegroundTerrain ground={environment.ground} />
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
