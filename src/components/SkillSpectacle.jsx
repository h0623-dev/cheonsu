import { useId } from 'react';
import { getCombatFrameStyle } from '../data/combatArt.js';
import { getSkillAuraAnchor } from '../data/skillAuraAnchors.js';
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
  if (theme === 'nature') return <>
    <circle cx="100" cy="108" r="76" fill={`url(#${id}-core)`} />
    <g className="vfx-spin" fill="none" stroke={ribbon} strokeLinecap="round">
      <path d="M29 164C44 115 91 159 100 102S131 72 172 37M52 184C59 143 98 149 109 105S149 111 174 67" strokeWidth="8" />
      <path d="M30 87C46 65 88 94 103 73S126 42 158 43" strokeWidth="5" />
    </g>
    <path d="M98 105C65 100 58 73 76 59C102 65 110 90 98 105M105 82C109 55 137 43 153 55C148 82 123 95 105 82" fill={ribbon} stroke={core} strokeWidth="1.3" />
    <path d="M69 148Q98 129 126 105" fill="none" stroke={core} strokeWidth="2" />
    {[[53, 109], [131, 139], [158, 73]].map(([x, y], index) => <path key={index} d={star} transform={`translate(${x} ${y}) scale(.7)`} fill={core} />)}
  </>;
  if (theme === 'water') return <>
    <circle cx="100" cy="104" r="75" fill={`url(#${id}-core)`} />
    <g className="vfx-spin" fill="none" stroke={ribbon} strokeLinecap="round">
      <path d="M26 124C79 173 175 119 158 67C140 21 47 31 49 85C50 116 106 127 124 88C101 124 151 133 178 112" strokeWidth="10" />
      <path d="M30 158C79 130 144 177 170 135M35 53C71 23 120 63 151 42" strokeWidth="5" />
    </g>
    <path d="M99 54C91 76 80 89 80 103C80 132 120 132 120 103C120 89 106 75 99 54Z" fill={ribbon} stroke={core} strokeWidth="1.7" />
    {[[47, 104], [141, 50], [148, 142]].map(([x, y], index) => <ellipse key={index} cx={x} cy={y} rx="5" ry="8" fill={core} opacity=".8" />)}
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

const WEAPON_KINDS = {
  sword: 'blade', greatsword: 'blade', katana: 'blade', scimitar: 'blade',
  lance: 'spear', polearm: 'spear', halberd: 'axe', poleaxe: 'axe', club: 'hammer',
  wand: 'staff', crystal: 'staff', orb: 'focus', hand: 'focus', book: 'focus',
  instrument: 'music', lute: 'music', lyre: 'music', gun: 'cannon', talons: 'claw',
  martial: 'fist', claws: 'claw', dualdagger: 'dagger', crossBow: 'crossbow',
};

function WeaponPaint({ id, color, core }) {
  return <defs><linearGradient id={`${id}-energy`} gradientUnits="userSpaceOnUse" x1="0" y1="512" x2="512" y2="0">
    <stop offset="0" stopColor={color} stopOpacity=".3" />
    <stop offset=".52" stopColor={core} stopOpacity=".95" />
    <stop offset="1" stopColor={color} stopOpacity=".7" />
  </linearGradient></defs>;
}

function FocusSigil({ theme, point, radius = 23, color, core }) {
  const [x, y] = point;
  const r = Math.max(6, Math.min(radius, x - 5, 507 - x, y - 5, 507 - y));
  const glyph = {
    lightning: 'M4-19-9-2 3-3-4 19 12 0 1 1Z',
    ice: 'M0-20 10-2 0 20-10-2ZM0-20V20M-15-9 15 9M-15 9 15-9',
    fire: 'M-2 20C-20 9-11-2-7-6C-10 7 3 2-1-8C-5-16 4-22 4-22C2-9 18-3 12 9C9 16 4 19-2 20Z',
    heal: 'M-5-17H5V-5H17V5H5V17H-5V5H-17V-5H-5Z',
    holy: 'M0-21 5-5 21 0 5 5 0 21-5 5-21 0-5-5Z',
    guard: 'M0-20 15-13 13 7Q9 17 0 22Q-9 17-13 7L-15-13ZM0-11V12M-8 0H8',
    music: 'M-7 13V-12L12-17V7M-7-6 12-11M-7 13C-20 8-23 19-13 20C-8 19-6 17-7 13M12 7C0 1-4 13 6 14C11 13 13 11 12 7',
    shadow: 'M12-19C-12-22-25 4-11 17C-2 25 14 19 19 9C-6 22-15-8 12-19Z',
    poison: 'M0-20C-6-9-14-2-14 7C-14 24 14 24 14 7C14-2 6-9 0-20ZM-5 4Q-8 13-1 16',
    nature: 'M0 20V-4M0 5C-21 1-21-16-8-18C3-15 6-3 0 5M0-2C20-9 24-22 11-23C1-22-4-12 0-2',
    water: 'M0-23C-3-13-16-2-16 8C-16 29 16 29 16 8C16-2 3-13 0-23M-7 9Q0 18 7 9',
    wind: 'M-20 2C-5-18 24-12 17 2C12 11-8 12-9 3C-8-3 1-6 7-2M-16 15Q5 26 21 10',
    earth: 'M0-20 15-7 11 14-8 19-18 3ZM-8-3 5 8 2 17',
    martial: 'M-17-7-8-14 3-10 11-13 19 1 10 15-8 13-18 5ZM-7-5 1 7M5-6 11 3',
  }[theme] || 'M0-20 5-5 20 0 5 5 0 20-5 5-20 0-5-5Z';
  return <g transform={`translate(${x} ${y}) scale(${r / 23})`}>
    <circle r="24" fill={color} opacity=".12" />
    <g className="vfx-weapon-orbit" fill="none" stroke={color}>
      <circle r="24" strokeWidth="1.8" strokeDasharray="27 7 6 7" />
    </g>
    <path d={glyph} fill={['ice', 'guard', 'music', 'earth', 'martial', 'wind'].includes(theme) ? 'none' : color} stroke={core} strokeWidth="1.5" strokeLinejoin="round" opacity=".95" />
    <path d="M0-5 1.5-1.5 5 0 1.5 1.5 0 5-1.5 1.5-5 0-1.5-1.5Z" fill={core} opacity=".9" />
  </g>;
}

function WeaponShape({ anchor, kind, visual, id }) {
  const [x, y] = anchor.grip, [tx, ty] = anchor.tip;
  const focus = anchor.focus || anchor.tip;
  const length = Math.max(1, Math.hypot(tx - x, ty - y));
  const angle = Math.atan2(ty - y, tx - x) * 180 / Math.PI;
  const energy = `url(#${id}-energy)`;
  const line = `M${x} ${y}L${tx} ${ty}`;
  const flow = { className: 'vfx-weapon-flow', fill: 'none', stroke: energy, strokeLinecap: 'round', strokeDasharray: '19 7 5 7' };
  if (kind === 'blade' && visual.sword) return <g transform={`translate(${x} ${y}) rotate(${angle})`} fill="none" strokeLinecap="round">
    <path d={`M12 0Q${length * .3} -20 ${length * .6} -13Q${length * .82} -23 ${length + 6} 0Q${length * .8} 15 ${length * .6} 9Q${length * .35} 22 12 0Z`} fill={energy} opacity=".6" />
    <path className="vfx-blade-coil" d={`M8 1C${length * .2} -23 ${length * .3} 23 ${length * .47} 0S${length * .76} -23 ${length - 3} 0`} stroke={energy} strokeWidth="8" strokeDasharray="22 5 11 3" />
    <path className="vfx-blade-coil" d={`M16 2C${length * .25} 21 ${length * .4} -21 ${length * .55} 0S${length * .82} 21 ${length + 3} 0`} stroke={visual.core} strokeWidth="3.2" strokeDasharray="13 11" opacity=".9" />
    <path d={`M18 0H${length - 1}`} stroke={visual.core} strokeWidth="1.5" opacity=".7" />
    <path d={star} transform={`translate(${length * .32} -18) scale(.45)`} fill={visual.core} />
    <path d={`M${length * .58} -24q-3 -9 2 -15q5 11 -2 15Z`} fill={visual.color} opacity=".8" />
  </g>;
  // Authored curved swords and whips use their original 512-pixel path, not a straight guess.
  if (anchor.path) return <>
    <path d={anchor.path} fill="none" stroke={visual.color} strokeWidth={kind === 'whip' ? 7 : 10} strokeLinecap="round" opacity=".35" />
    <path {...flow} d={anchor.path} strokeWidth={kind === 'whip' ? 3.5 : 4.5} />
    <path d={anchor.path} fill="none" stroke={visual.core} strokeWidth="1.3" opacity=".7" />
    <path d={star} transform={`translate(${tx} ${ty}) scale(.55)`} fill={visual.core} />
    {anchor.secondary && <>
      <path d={anchor.secondary.path || `M${anchor.secondary.grip.join(' ')}L${anchor.secondary.tip.join(' ')}`} fill="none" stroke={visual.color} strokeWidth="6" strokeLinecap="round" opacity=".35" />
      <path {...flow} d={anchor.secondary.path || `M${anchor.secondary.grip.join(' ')}L${anchor.secondary.tip.join(' ')}`} strokeWidth="2.8" />
    </>}
  </>;
  if (kind === 'staff' || kind === 'focus') return <>
    {kind === 'staff' && <path {...flow} d={`M${x} ${y}L${focus[0]} ${focus[1]}`} strokeWidth="3.8" />}
    {kind === 'focus' && <path {...flow} d={`M${focus[0] - 20} ${focus[1] + 10}Q${focus[0] - 24} ${focus[1] - 24} ${focus[0] + 12} ${focus[1] - 19}`} strokeWidth="3" />}
    <FocusSigil theme={visual.theme} point={focus} color={visual.color} core={visual.core} />
    {anchor.secondary && <path d={star} transform={`translate(${anchor.secondary.tip.join(' ')}) scale(1.2)`} fill={visual.core} opacity=".75" />}
    {anchor.bookCenter && <path d="M0-12 4-4 12 0 4 4 0 12-4 4-12 0-4-4ZM-8-8 8 8M8-8-8 8" transform={`translate(${anchor.bookCenter.join(' ')})`} fill="none" stroke={visual.core} strokeWidth="1.7" opacity=".85" />}
  </>;
  if (kind === 'bow' || kind === 'crossbow') {
    const upper = anchor.bow?.upper, lower = anchor.bow?.lower;
    const limb = anchor.bow?.path || (upper && lower ? `M${upper[0]} ${upper[1]}Q${x + (x - upper[0]) * .12} ${(upper[1] + y) / 2} ${x} ${y}Q${x + (x - lower[0]) * .12} ${(lower[1] + y) / 2} ${lower[0]} ${lower[1]}` : line);
    return <>
      <path {...flow} d={limb} strokeWidth="3.2" />
      {anchor.bow?.arrowVisible !== false && <>
        <path {...flow} d={`M${focus[0]} ${focus[1]}L${tx} ${ty}`} strokeWidth="5.2" strokeDasharray="12 4" />
        <path d={`M${focus[0]} ${focus[1]}L${tx} ${ty}`} fill="none" stroke={visual.core} strokeWidth="1.3" />
      </>}
      <path d={star} transform={`translate(${focus.join(' ')}) scale(.95)`} fill={visual.core} />
      {anchor.bow?.arrowVisible !== false && <path d={star} transform={`translate(${tx} ${ty}) scale(.65)`} fill={visual.color} />}
    </>;
  }
  if (kind === 'shield') return <g transform={`translate(${focus.join(' ')})`} fill="none">
    <path d="M0-35 27-22 25 12Q20 32 0 42Q-20 32-25 12L-27-22Z" fill={energy} opacity=".22" />
    <path className="vfx-weapon-flow" d="M0-35 27-22 25 12Q20 32 0 42Q-20 32-25 12L-27-22Z" stroke={visual.core} strokeWidth="2.1" strokeDasharray="16 8" />
    <path d="M0-20V22M-15-1H15M-20-19-15-9M20-19 15-9M-12 23 0 31 12 23" stroke={visual.color} strokeWidth="2.5" />
  </g>;
  if (kind === 'fist' || kind === 'claw') return <g transform={`translate(${focus.join(' ')}) rotate(${angle})`} fill="none" strokeLinecap="round">
    <path className="vfx-weapon-flow" d="M-23-14Q-6-23 17-11M-25 0Q-4-7 22 2M-20 14Q-4 9 17 16" stroke={energy} strokeWidth={kind === 'claw' ? 4 : 5.5} strokeDasharray="14 7" />
    <path d="M-18-13Q-4-17 14-10M-20 0Q-3-3 17 2M-15 13Q-2 11 13 15" stroke={visual.core} strokeWidth="1.2" />
    <path d={star} transform="translate(2 0) scale(.8)" fill={visual.core} />
    {anchor.secondary && <path d={star} transform={`translate(${(anchor.secondary.tip[0] - focus[0]) * Math.cos(-angle * Math.PI / 180) - (anchor.secondary.tip[1] - focus[1]) * Math.sin(-angle * Math.PI / 180)} ${(anchor.secondary.tip[0] - focus[0]) * Math.sin(-angle * Math.PI / 180) + (anchor.secondary.tip[1] - focus[1]) * Math.cos(-angle * Math.PI / 180)}) scale(.9)`} fill={visual.color} opacity=".7" />}
  </g>;
  if (kind === 'music') return <g transform={`translate(${focus.join(' ')})`} fill="none" strokeLinecap="round">
    <g className="vfx-weapon-orbit" stroke={visual.color}>
      <ellipse rx="28" ry="20" strokeWidth="2" strokeDasharray="24 6" />
    </g>
    <path className="vfx-weapon-flow" d="M-22-5Q0-21 22-5M-24 4Q0-10 24 4M-20 13Q0 0 20 13" stroke={energy} strokeWidth="2.6" strokeDasharray="17 6" />
    <path d="M9-3V-24L23-29V-10M9-17 23-22M9-3C0-8-7 2 1 5C7 7 12 2 9-3M23-10C13-15 9-4 17-2C24 0 28-6 23-10" fill={visual.core} stroke={visual.core} strokeWidth="1" />
  </g>;
  if (kind === 'cannon') return <>
    <path {...flow} d={line} strokeWidth="4" />
    <g transform={`translate(${focus.join(' ')}) rotate(${angle})`} fill="none">
      <ellipse rx="9" ry="19" stroke={visual.color} strokeWidth="3.5" opacity=".85" />
      <path className="vfx-weapon-flow" d="M-5-14 2-6 12-9 5 0 12 9 2 6-5 14" stroke={visual.core} strokeWidth="2" strokeDasharray="10 5" />
      <path d="M-2-5 7 0-2 5Z" fill={visual.core} />
    </g>
  </>;
  if (kind === 'axe' || kind === 'hammer') return <>
    <path {...flow} d={line} strokeWidth="3.7" />
    <g transform={`translate(${focus.join(' ')}) rotate(${angle})`} fill="none">
      <path className="vfx-weapon-flow" d={kind === 'axe' ? 'M-11-30Q20-22 22 0Q20 22-11 30M-7-23Q11 0-7 23' : 'M-15-25H12L19-17V17L12 25H-15M-18-13H17M-18 13H17'} stroke={energy} strokeWidth="4.5" strokeDasharray="14 6" />
      <path d={kind === 'axe' ? 'M-9-23Q16-17 16 0Q16 17-9 23' : 'M-10-20H10L14-14V14L10 20H-10'} stroke={visual.core} strokeWidth="1.2" />
      <path d={star} transform="scale(.7)" fill={visual.core} />
    </g>
  </>;
  if (kind === 'dagger' && anchor.secondary) return <>
    <path {...flow} d={line} strokeWidth="6" />
    <path {...flow} d={`M${anchor.secondary.grip.join(' ')}L${anchor.secondary.tip.join(' ')}`} strokeWidth="5" strokeDasharray="13 7" />
    <path d={line} fill="none" stroke={visual.core} strokeWidth="1.3" />
    <path d={`M${anchor.secondary.grip.join(' ')}L${anchor.secondary.tip.join(' ')}`} fill="none" stroke={visual.core} strokeWidth="1.1" />
  </>;
  return <g transform={`translate(${x} ${y}) rotate(${angle})`} fill="none" strokeLinecap="round">
    <path className="vfx-weapon-flow" d={`M5 0Q${length * .35} -12 ${length * .56} 0T${length} 0`} stroke={energy} strokeWidth={kind === 'spear' ? 5 : 7} strokeDasharray="23 7 5 7" />
    <path className="vfx-weapon-flow" d={`M10 0Q${length * .4} 10 ${length * .63} 0T${length} 0`} stroke={visual.color} strokeWidth="3.2" strokeDasharray="14 9" />
    <path d={`M8 0H${length}`} stroke={visual.core} strokeWidth="1.35" opacity=".9" />
    <path d={star} transform={`translate(${length * .83} -11) scale(.5)`} fill={visual.core} />
  </g>;
}

function UnitSkillAura({ plan, unitKey }) {
  const unique = useId().replace(/:/g, '');
  const baseVisual = plan?.spectacle;
  if (!baseVisual?.weapon) return null;
  const visual = baseVisual.sword ? { ...baseVisual, color: baseVisual.sword.kind === 'gold' ? '#eabc59' : '#ff8739', core: baseVisual.sword.kind === 'gold' ? '#fff5c5' : '#fff2ae' } : baseVisual;
  const skillFrame = plan.skillPose?.src?.includes('skill-b') ? 'skill-b' : 'skill-a';
  return ['windup', 'strike', 'skill'].map(pose => {
    const sourcePose = pose === 'skill' ? skillFrame : pose;
    const anchor = getSkillAuraAnchor(unitKey, sourcePose, plan.weapon);
    const kind = WEAPON_KINDS[anchor.kind] || anchor.kind;
    const style = pose === 'skill' && plan.skillPose ? { '--combat-sprite-scale': plan.skillPose.scale, '--combat-foot-offset': plan.skillPose.footOffset || '0%' } : getCombatFrameStyle(unitKey, sourcePose);
    const id = `weapon-${unique}-${pose}`;
    return <svg key={pose} className="vfx-weapon-aura" viewBox="0 0 512 512" data-vfx-phase="weapon" data-vfx-anchor="weapon" data-pose={pose} data-grip={anchor.grip.join(',')} data-tip={anchor.tip.join(',')} data-focus={anchor.focus?.join(',')} data-vfx-kind={kind} data-kind={kind} data-vfx-unit={unitKey} data-anchor-origin={anchor.origin} data-anchor-authored={String(anchor.authored)} data-anchor-reviewed={String(Boolean(anchor.reviewed))} style={{ ...style, color: visual.color }} aria-hidden="true">
      <WeaponPaint id={id} color={visual.color} core={visual.core} />
      <WeaponShape anchor={anchor} kind={kind} visual={visual} id={id} />
    </svg>;
  });
}

export function SwordSkillAura({ plan, unitKey }) {
  const unique = useId().replace(/:/g, '');
  const visual = plan?.spectacle;
  if (unitKey !== 'hero') return <UnitSkillAura plan={plan} unitKey={unitKey} />;
  if (!visual?.sword) return null;
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
    return <svg key={pose} className="vfx-blade-aura" viewBox="0 0 512 512" data-vfx-phase="weapon" data-vfx-anchor="weapon" data-pose={pose} data-grip={anchor.grip.join(',')} data-tip={anchor.tip.join(',')} data-kind="blade" data-vfx-kind="blade" data-vfx-unit={unitKey} data-anchor-origin="authored-frame" data-anchor-authored="true" style={style} aria-hidden="true">
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
