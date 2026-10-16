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
      <path d="M24 84Q100 49 176 84M29 121Q100 151 171 121" fill="none" className="cinematic-wave-fringe" />
      <path d="M18 100Q43 77 67 88M133 112Q158 123 182 100" fill="none" className="cinematic-wave-spray" />
      <path d="M38 83 33 72 40 76M159 81 165 69 161 85M58 122 51 132 62 127M138 124 150 135 145 122" fill="none" className="cinematic-wave-fragments" />
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

// Midground marks stay at the edges and below the distant skyline. They do not
// duplicate the chapter painting, add obstacles or hide the actors' contact lane.
function MidgroundTerrain({ biome }) {
  if (['frontier', 'forest'].includes(biome)) return <>
    <path className="cinematic-midground-mass" d="M0 402V330Q24 313 41 338Q54 306 78 336Q98 320 115 355L144 413ZM1000 408V338Q973 314 956 344Q933 323 912 350L875 414Z" />
    <path className="cinematic-midground-line" d="M0 409Q61 392 153 418M846 420Q928 398 1000 410M42 386 48 359 53 387M103 405 110 377 116 409M923 399 929 369 936 401" />
  </>;
  if (biome === 'snow') return <>
    <path className="cinematic-midground-mass" d="M0 404V364L32 349 62 374 91 361 133 406ZM1000 410V361L964 348 943 372 911 360 867 413Z" />
    <path className="cinematic-midground-line" d="M4 371 32 355 58 379M917 368 941 380 964 355 996 369M0 411Q85 392 173 422M825 424Q919 397 1000 416" />
  </>;
  if (biome === 'coast') return <>
    <path className="cinematic-midground-mass" d="M0 410V393L27 384 50 393 73 387 118 417ZM1000 418V390L978 377 957 395 932 390 902 423Z" />
    <path className="cinematic-midground-line" d="M0 371Q53 360 108 371M889 376Q946 363 1000 376M0 402Q87 389 178 405M815 411Q909 394 1000 406" />
  </>;
  if (biome === 'workshop') return <>
    <path className="cinematic-midground-mass" d="M0 414V365H27V347H46V382H74V373H91V419ZM1000 419V369H972V348H956V386H927V377H908V423Z" />
    <path className="cinematic-midground-line" d="M0 404H94L123 420M901 421 924 405H1000M18 371V396M967 363V397" />
  </>;
  return <>
    <path className="cinematic-midground-mass" d="M0 415V367L18 358 35 368V396H58V378L75 371 92 381V420ZM1000 422V369L980 359 963 371V397H939V380L922 373 905 383V424Z" />
    <path className="cinematic-midground-line" d="M0 407H82L108 423M886 426 912 408H1000M18 366V392M980 367V393" />
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
  const data = { 'data-cinematic-biome': environment.biome, 'data-cinematic-weather': environment.weather, 'data-cinematic-ground': environment.ground, 'data-cinematic-layout': environment.layout };
  return <>
    <div className="cinematic-atmosphere" data-cinematic-layer="atmosphere" {...data} style={environment.style} aria-hidden="true">
      <div className="cinematic-horizon-glow" />
      <div className="cinematic-sky-light" />
      <svg className="cinematic-light-shafts" viewBox="0 0 1000 600" preserveAspectRatio="none">
        <path d="M178 0H220L457 600H242Z" />
        <path d="M267 0H281L591 600H515Z" opacity=".55" />
        <path d="M724 0H747L617 600H495Z" opacity=".65" />
      </svg>
      <div className="cinematic-haze" />
      <svg className="cinematic-midground" viewBox="0 0 1000 600" preserveAspectRatio="none"><MidgroundTerrain biome={environment.biome} /></svg>
      <div className="cinematic-motes">{environment.motes.map((mote, index) => <i key={index} data-cinematic-mote={index} data-cinematic-depth={mote.depth} style={{ left: `${mote.x}%`, top: `${mote.y}%`, '--cinematic-mote-size': `${mote.size}px` }} />)}</div>
    </div>
    <div className="cinematic-ground-bed" data-cinematic-layer="ground" {...data} style={environment.style} aria-hidden="true">
      <div className="cinematic-ground-haze" />
      <div className="cinematic-ground-reflection" />
      <svg className="cinematic-ground-grain" viewBox="0 0 1000 160" preserveAspectRatio="none">
        <path d="M58 129 102 123M184 145 226 138M778 141 834 145M898 113 935 120M318 152 337 151M657 148 682 146" />
        <path className="cinematic-depth-grain" d="M0 84 114 87M882 86 1000 83M0 114 168 123M825 119 1000 110M25 156 198 138M812 140 980 157M204 20 173 53M794 21 823 53" />
        {['wet', 'ice'].includes(environment.ground) && <path className="cinematic-water-sheen" d="M49 115Q130 98 211 115M736 127Q831 108 932 128M238 146Q332 134 421 146M578 151Q634 142 708 151" />}
        {environment.ground === 'rune' && <path className="cinematic-rune-inlay" d="M78 143 118 132 159 143M837 143 877 132 918 143M112 136V148M871 136V148" />}
        {environment.ground === 'metal' && <path className="cinematic-metal-seams" d="M46 158 168 23M954 158 831 23M0 102H190M808 102H1000M12 137H157M843 137H989" />}
      </svg>
    </div>
    <svg className="cinematic-foreground" data-cinematic-layer="foreground" {...data} style={environment.style} viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true">
      <ForegroundTerrain ground={environment.ground} />
      <path className="cinematic-foreground-glints" d="M13 205 17 193M48 211 53 203M84 216 88 209M989 209 984 198M951 214 945 207M924 219 918 214" fill="none" />
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
