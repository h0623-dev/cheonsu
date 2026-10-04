import { useId } from 'react';
import { getCombatFrameStyle } from '../data/combatArt.js';
import './skill-spectacle.css';

function LightPaint({ id, color, core }) {
  return <defs>
    <linearGradient id={`${id}-ribbon`} x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stopColor={color} stopOpacity=".12" />
      <stop offset=".35" stopColor={color} stopOpacity=".9" />
      <stop offset=".72" stopColor={core} />
      <stop offset="1" stopColor={color} stopOpacity=".1" />
    </linearGradient>
    <radialGradient id={`${id}-core`}>
      <stop offset="0" stopColor={core} stopOpacity=".8" />
      <stop offset=".4" stopColor={color} stopOpacity=".25" />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </radialGradient>
  </defs>;
}

const star = 'M0-7 2-2 7 0 2 2 0 7-2 2-7 0-2-2Z';

function ContactShape({ theme, id, core }) {
  const ribbon = `url(#${id}-ribbon)`;
  if (theme === 'fire') return <>
    <ellipse cx="100" cy="104" rx="66" ry="77" fill={`url(#${id}-core)`} />
    <g className="vfx-spin" fill="none" stroke={ribbon} strokeLinecap="round">
      <path d="M37 149C18 127 52 105 128 109S167 66 79 86C23 99 33 54 139 45" strokeWidth="14" />
      <path d="M154 151C188 117 142 96 67 105S25 63 143 69C180 71 141 42 99 27" strokeWidth="10" />
      <path d="M62 161C140 173 171 143 107 130S61 91 130 85C173 81 143 57 105 45" strokeWidth="7" />
    </g>
    <path className="vfx-plume" d="M96 165C56 144 78 116 80 110C79 132 94 132 96 119C108 94 92 68 102 36C107 67 128 81 119 110C114 123 119 138 127 119C142 151 115 167 96 165Z" fill={ribbon} />
    <path d="M101 153C86 140 106 110 100 83C118 117 114 143 101 153Z" fill={core} opacity=".92" />
    {[[-33, -19], [32, -44], [-19, -65], [39, 21]].map(([x, y], index) => <path key={index} d={star} transform={`translate(${100 + x} ${100 + y}) rotate(${index * 37}) scale(.65)`} fill={core} />)}
  </>;
  if (theme === 'lightning') return <>
    <circle cx="100" cy="100" r="68" fill={`url(#${id}-core)`} />
    <g className="vfx-spin" fill="none" stroke="currentColor" strokeLinecap="round">
      <path d="M100 5 79 62 108 57 91 103 123 91 103 191M91 102 43 89 21 112M110 59 152 47 176 62M103 130 147 151 158 183" strokeWidth="7" />
      <path d="M14 53 38 69 29 93M175 117 151 128 170 154" strokeWidth="3" />
    </g>
    <path d="M100 5 79 62 108 57 91 103 123 91 103 191" fill="none" stroke={core} strokeWidth="2.4" />
    <path d="M100 64 105 93 133 100 105 107 100 135 94 107 67 100 94 93Z" fill={core} />
  </>;
  if (theme === 'ice') return <>
    <circle cx="100" cy="112" r="72" fill={`url(#${id}-core)`} />
    <g className="vfx-spin">
      {[-2, -1, 0, 1, 2].map(index => <g key={index} transform={`rotate(${index * 29} 100 135)`}>
        <path d="M100 18 113 95 100 150 87 95Z" fill={ribbon} stroke="currentColor" strokeWidth="1.3" />
        <path d="M100 20V148L89 96" fill="none" stroke={core} strokeWidth="1.4" />
      </g>)}
    </g>
    <path d="M27 148Q100 129 173 148M44 160Q100 149 155 160" fill="none" stroke={core} opacity=".65" />
  </>;
  if (theme === 'heal' || theme === 'holy') return <>
    <ellipse cx="100" cy="127" rx="67" ry="51" fill={`url(#${id}-core)`} />
    <path className="vfx-plume" d="M70 15H130L113 149H87Z" fill={ribbon} opacity=".72" />
    <path d="M97 22H103V152H97Z" fill={core} opacity=".65" />
    <g className="vfx-spin" fill="none" stroke="currentColor">
      <ellipse cx="100" cy="146" rx="65" ry="16" strokeWidth="2.4" />
      <ellipse cx="100" cy="146" rx="52" ry="11" opacity=".6" />
    </g>
    {[[58, 67], [142, 54], [38, 112], [160, 108]].map(([x, y], index) => <path key={index} d={star} transform={`translate(${x} ${y}) scale(${index % 2 ? 1 : .7})`} fill={core} />)}
    <path d={theme === 'heal' ? 'M90 88H110V108H130V128H110V148H90V128H70V108H90Z' : 'M100 65 108 98 141 106 108 114 100 147 92 114 59 106 92 98Z'} fill={core} opacity=".85" />
  </>;
  if (theme === 'guard') return <>
    <circle cx="100" cy="102" r="79" fill={`url(#${id}-core)`} />
    <g className="vfx-spin" fill="none" stroke="currentColor">
      <circle cx="100" cy="100" r="78" strokeWidth="2.3" strokeDasharray="70 10 18 10" />
      <circle cx="100" cy="100" r="66" strokeWidth="1" opacity=".65" />
    </g>
    <path d="M100 27 160 48 153 116Q139 154 100 175Q61 154 47 116L40 48Z" fill={ribbon} stroke={core} strokeWidth="2.6" />
    <path d="M100 46 140 62 135 111Q126 139 100 153Q74 139 65 111L60 62Z" fill="none" stroke={core} strokeWidth="1.2" />
    <path d="M100 60V136M74 95H126" stroke={core} strokeWidth="3" />
  </>;
  if (theme === 'music') return <>
    <circle cx="100" cy="100" r="77" fill={`url(#${id}-core)`} />
    <g className="vfx-spin" fill="none" stroke="currentColor">
      {[43, 64, 83].map(radius => <circle key={radius} cx="100" cy="100" r={radius} strokeWidth={radius === 64 ? 3.4 : 1.3} strokeDasharray="85 16 12 16" />)}
    </g>
    <path d="M42 118Q76 78 108 103T175 86" fill="none" stroke={core} strokeWidth="2" />
    <path d="M93 125V65L132 54V111M93 77 132 65" fill="none" stroke={core} strokeWidth="3.5" />
    <ellipse cx="84" cy="126" rx="11" ry="7" transform="rotate(-20 84 126)" fill={core} />
    <ellipse cx="123" cy="112" rx="11" ry="7" transform="rotate(-20 123 112)" fill={core} />
  </>;
  if (theme === 'shadow') return <>
    <circle cx="100" cy="100" r="78" fill={`url(#${id}-core)`} />
    <g className="vfx-spin" fill={ribbon}>
      <path d="M30 149C178 139 182 42 63 22C158 65 136 118 30 149Z" />
      <path d="M171 48C33 44 16 141 131 175C54 124 67 72 171 48Z" opacity=".8" />
    </g>
    <path d="M45 147 142 40M58 162 158 55" stroke={core} strokeWidth="2.5" />
    <path d="M100 75 107 94 125 100 107 107 100 126 94 107 75 100 94 94Z" fill={core} />
  </>;
  if (theme === 'earth' || theme === 'martial') return <>
    <ellipse cx="100" cy="135" rx="79" ry="52" fill={`url(#${id}-core)`} />
    <g className="vfx-spin" fill="none" stroke="currentColor">
      <ellipse cx="100" cy="139" rx="77" ry="31" strokeWidth="4" />
      <ellipse cx="100" cy="139" rx="60" ry="22" strokeWidth="1.6" />
    </g>
    <path d="M100 35 112 94 154 68 129 113 183 131 126 133 145 178 105 147 82 188 83 140 28 151 72 121 37 88 89 103Z" fill={ribbon} />
    <path d="M100 84 107 119 133 126 107 134 100 166 93 134 66 126 93 119Z" fill={core} />
    {[[43, 86], [155, 80], [165, 153], [31, 141]].map(([x, y], index) => <path key={index} d="M-6-4 4-7 8 2 2 7-7 3Z" transform={`translate(${x} ${y}) rotate(${index * 43})`} fill="currentColor" />)}
  </>;
  if (theme === 'poison') return <>
    <circle cx="100" cy="107" r="78" fill={`url(#${id}-core)`} />
    <g className="vfx-spin" fill={ribbon}>
      <path d="M29 141Q72 168 131 137T170 73Q145 114 115 101T29 141" />
      <path d="M39 69Q78 29 139 67T171 132Q137 91 93 103T39 69" />
    </g>
    {[[64, 85, 12], [127, 74, 9], [142, 119, 14], [82, 143, 8]].map(([x, y, r], index) => <circle key={index} cx={x} cy={y} r={r} fill="none" stroke={core} strokeWidth="2" />)}
  </>;
  return <>
    <circle cx="100" cy="100" r="75" fill={`url(#${id}-core)`} />
    <g className="vfx-spin" fill="none" stroke={ribbon} strokeLinecap="round">
      <path d="M26 143C177 149 190 62 74 33C152 77 152 111 26 143" strokeWidth="9" />
      <path d="M176 64C14 48 8 134 123 169C56 122 65 93 176 64" strokeWidth="6" />
    </g>
    <path d="M37 140C123 121 163 74 82 39M169 67C97 75 46 122 116 161" fill="none" stroke={core} strokeWidth="2" />
  </>;
}

export default function SkillSpectacle({ plan }) {
  const unique = useId().replace(/:/g, '');
  const visual = plan.spectacle;
  if (!visual) return null;
  const id = `spectacle-${unique}`;
  return <div className="skill-spectacle" data-skill-theme={visual.theme} aria-hidden="true" style={{ color: visual.color }}>
    <div className="vfx-charge" data-vfx-phase="charge" data-vfx-anchor="attacker">
      <svg viewBox="0 0 200 200" fill="none">
        <LightPaint id={`${id}-charge`} color={visual.color} core={visual.core} />
        <ellipse cx="100" cy="151" rx="69" ry="20" fill={`url(#${id}-charge-core)`} />
        <g className="vfx-spin" stroke="currentColor">
          <ellipse cx="100" cy="151" rx="70" ry="19" strokeWidth="2.1" strokeDasharray="54 9 10 9" />
          <ellipse cx="100" cy="151" rx="55" ry="14" strokeWidth="1.1" />
          <path d="M29 151H41M159 151H171M100 132V141M100 162V171M61 137 68 141M139 137 132 141M58 164 68 160M142 164 132 160" strokeWidth="2" />
        </g>
        <path className="vfx-plume" d="M53 139Q52 112 76 94M148 139Q150 107 127 85M78 131Q74 105 94 70M123 128Q127 99 110 51" stroke={`url(#${id}-charge-ribbon)`} strokeWidth="3" strokeLinecap="round" />
        {[[70, 81], [125, 69], [103, 40], [143, 111]].map(([x, y], index) => <path key={index} d={star} transform={`translate(${x} ${y}) scale(${index % 2 ? .7 : .5})`} fill={visual.core} />)}
      </svg>
    </div>
    {visual.bursts.map((burst, index) => <div key={index} className={`vfx-burst vfx-${visual.theme}`} data-vfx-phase="contact" data-vfx-anchor="target" data-vfx-index={index}>
      <svg viewBox="0 0 200 200" fill="none">
        <LightPaint id={`${id}-burst-${index}`} color={visual.color} core={visual.core} />
        <ContactShape theme={burst.kind} id={`${id}-burst-${index}`} core={visual.core} />
      </svg>
    </div>)}
  </div>;
}

const HERO_BLADE = {
  windup: { grip: [310, 186], tip: [149, 129] },
  strike: { grip: [336, 276], tip: [491, 276] },
  'skill-a': { grip: [329, 288], tip: [488, 288] },
  'skill-b': { grip: [329, 214], tip: [335, 72] },
};

export function SwordSkillAura({ plan, unitKey }) {
  const unique = useId().replace(/:/g, '');
  const visual = plan?.spectacle;
  if (unitKey !== 'hero' || !visual?.sword) return null;
  const skillFrame = plan.skillPose?.src?.includes('skill-b') ? 'skill-b' : 'skill-a';
  const color = visual.sword.kind === 'gold' ? '#eabc59' : '#ff8739';
  const core = visual.sword.kind === 'gold' ? '#fff5c5' : '#fff2ae';
  return ['windup', 'strike', 'skill'].map(pose => {
    const anchor = HERO_BLADE[pose === 'skill' ? skillFrame : pose];
    const [x, y] = anchor.grip;
    const length = Math.hypot(anchor.tip[0] - x, anchor.tip[1] - y);
    const angle = Math.atan2(anchor.tip[1] - y, anchor.tip[0] - x) * 180 / Math.PI;
    const style = pose === 'skill' && plan.skillPose ? { '--combat-sprite-scale': plan.skillPose.scale, '--combat-foot-offset': plan.skillPose.footOffset || '0%' } : getCombatFrameStyle(unitKey, pose);
    const id = `blade-${unique}-${pose}`;
    return <svg key={pose} className="vfx-blade-aura" viewBox="0 0 512 512" data-vfx-phase="weapon" data-vfx-anchor="weapon" data-pose={pose} data-grip={anchor.grip.join(',')} data-tip={anchor.tip.join(',')} style={style} aria-hidden="true">
      <LightPaint id={id} color={color} core={core} />
      <g transform={`translate(${x} ${y}) rotate(${angle})`} fill="none" strokeLinecap="round">
        <path d={`M12 0Q${length * .3} -20 ${length * .6} -13Q${length * .82} -23 ${length + 6} 0Q${length * .8} 15 ${length * .6} 9Q${length * .35} 22 12 0Z`} fill={`url(#${id}-ribbon)`} opacity=".6" />
        <path className="vfx-blade-coil" d={`M8 1C${length * .2} -23 ${length * .3} 23 ${length * .47} 0S${length * .76} -23 ${length - 3} 0`} stroke={`url(#${id}-ribbon)`} strokeWidth="8" strokeDasharray="22 5 11 3" />
        <path className="vfx-blade-coil" d={`M16 2C${length * .25} 21 ${length * .4} -21 ${length * .55} 0S${length * .82} 21 ${length + 3} 0`} stroke={core} strokeWidth="3.2" strokeDasharray="13 11" opacity=".9" />
        <path d={`M18 0H${length - 1}`} stroke={core} strokeWidth="1.5" opacity=".7" />
        <path d={star} transform={`translate(${length * .32} -18) scale(.45)`} fill={core} />
        <path d={star} transform={`translate(${length * .73} 17) scale(.36)`} fill={color} />
        <path d={`M${length * .58} -24q-3 -9 2 -15q5 11 -2 15Z`} fill={color} opacity=".8" />
      </g>
    </svg>;
  });
}
