import { useId } from 'react';
import { getCombatFrameStyle } from '../data/combatArt.js';
import { getSkillAuraAnchor } from '../data/skillAuraAnchors.js';
import { resolveCombatPose } from '../data/combatPoseIdentity.js';
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

// 열린 윤곽으로 B안의 큰 곡선을 그립니다. 중심을 흰 면으로 채우지 않아
// 얼굴·실제 무기·상대의 피격 자세가 그 안에서 계속 읽힙니다.
const B_SIGNS = {
  'flame-vortex': 'M24 146C171 186 203 47 66 25C157 64 156 132 24 146M36 163C149 177 185 112 151 69M57 167C103 153 115 123 115 98',
  'inferno-vortex': 'M14 143C164 194 211 37 59 13C165 53 163 137 14 143M25 169C171 183 187 86 138 42M53 178C122 157 133 113 124 73',
  'phoenix-arrow': 'M30 119Q69 127 101 103Q64 92 28 47Q82 55 112 91Q146 53 177 56Q159 91 121 102L181 100M35 139Q81 151 115 114',
  sanctuary: 'M22 142A78 78 0 0 1 178 142M39 141A61 61 0 0 1 161 141M24 145Q100 179 176 145M45 163Q100 185 155 163M65 59 74 51M135 59 126 51',
  bastion: 'M100 18 166 41 158 116Q145 155 100 181Q55 155 42 116L34 41ZM100 34 151 52 144 111Q133 140 100 160Q67 140 56 111L49 52ZM50 153Q100 177 150 153',
  'wind-lance': 'M18 102 163 84 190 100 163 116ZM31 67Q106 40 165 74M31 133Q106 160 165 126M136 74Q112 100 136 126',
  'tidal-lance': 'M17 116C86 154 157 116 177 54C153 84 135 110 91 108M23 145C93 173 169 134 183 89M40 60Q87 29 139 60M41 103H174',
  'cross-shadow': 'M23 162Q104 119 172 27Q133 116 46 178M27 29Q105 119 174 163Q105 141 38 51M28 147Q31 76 90 41',
  'thunder-formula': 'M100 12 79 65 112 59 89 109 121 98 100 188M90 105 41 86 19 110M110 60 155 39 181 61M43 42H67V66M157 158H133V134',
  'moon-ribbon': 'M131 20A82 82 0 1 0 172 143A73 73 0 0 1 131 20M27 138Q98 184 177 130M44 159Q107 184 158 151',
  'earth-split': 'M100 109 20 143 8 175M100 109 59 71 20 56M100 109 145 154 181 165M100 109 161 82 190 36M57 129 43 170M145 99 150 59',
  foxfire: 'M19 136C97 181 182 118 158 38C147 80 110 69 97 94C121 83 132 102 116 119C85 150 45 126 19 136M42 79 57 46 81 66M120 61 145 41 152 71',
  'arrow-volley': 'M19 73H166L153 65M19 100H188L173 91M19 127H166L153 119M30 42Q100 8 170 42M30 158Q100 192 170 158',
  'crystal-lance': 'M100 12 118 121 100 181 82 121ZM100 24V178M30 139 62 47 69 134M170 139 138 47 131 134',
  'lute-resonance': 'M51 27A82 82 0 0 1 51 173M77 40A68 68 0 0 1 77 160M97 54A53 53 0 0 1 97 146M42 102Q83 69 126 105T184 85M85 129V76L112 68V116',
  'dragon-coil': 'M24 157C146 180 179 125 117 105S44 83 99 62C119 53 151 54 158 29L178 45 158 65 146 60M32 178C169 186 196 109 126 91M151 39 156 16M168 46 188 43',
  'knight-aegis': 'M100 19 153 48 143 116 100 170 57 116 47 48ZM37 115Q24 73 44 40M163 115Q176 73 156 40M50 158Q100 183 150 158',
  'tiger-pressure': 'M45 50 54 23 78 45H122L146 23 155 50 151 118 125 153 100 166 75 153 49 118ZM61 72 84 89 65 98M139 72 116 89 135 98M86 122 100 134 115 122M46 166Q100 190 154 166',
  'meridian-lotus': 'M100 153Q43 130 39 93Q81 91 100 136Q119 91 161 93Q157 130 100 153ZM100 145Q67 93 100 54Q133 93 100 145M26 154Q100 182 174 154M45 169Q100 190 155 169',
  'forge-impact': 'M100 25 165 62V137L100 175 35 137V62ZM100 48 144 74V124L100 151 56 124V74ZM35 100H17M165 100H183M100 25V10M100 175V190',
  'living-roots': 'M22 177C53 147 42 113 80 91S85 45 118 22M61 185C88 151 78 127 114 105S143 60 168 30M113 181C146 150 154 121 179 109M77 95Q48 88 52 62Q79 63 77 95M119 104Q145 103 151 78Q123 77 119 104',
  'precision-bolt': 'M13 100H188L170 90M36 61V39H61M139 39H164V61M164 139V161H139M61 161H36V139M127 62A43 43 0 0 1 127 138M89 68V132',
  'venom-seal': 'M38 56 100 19 162 56V138L100 177 38 138ZM67 62Q94 35 125 67T137 135Q99 111 64 136T67 62M80 152Q100 164 120 152',
  'whip-spiral': 'M15 153C38 44 115 13 165 48S181 126 107 144C151 116 166 85 129 73M27 174C93 191 171 155 184 108M169 105 179 123 193 110',
  'twin-crescents': 'M22 156C160 171 197 50 75 21C146 74 132 129 22 156M178 44C40 29 3 150 125 179C54 126 68 71 178 44',
  'cannon-flare': 'M100 18 113 69 152 41 132 85 187 96 136 113 159 158 113 133 96 186 85 135 39 156 64 112 12 94 66 82 45 39 87 69Z',
  'void-cleave': 'M22 162C169 179 199 36 61 17C157 69 136 130 22 162M46 180C162 170 178 102 148 69M46 48 35 72M157 152 169 130',
  'frost-claws': 'M36 160Q82 131 143 35M62 176Q109 142 166 53M17 133Q69 101 120 20M33 177Q100 192 167 163',
  'feather-claws': 'M34 162Q91 130 158 25M64 175Q122 133 182 52M15 133Q70 102 128 15M35 68 17 48 44 55M148 148 175 144 160 163',
  'stone-fissure': 'M100 113 16 150 8 175M100 113 43 62 18 49M100 113 157 78 188 31M100 113 144 164 181 176M24 103 37 87 51 107 37 120ZM148 48 159 29 176 45 165 64Z',
  'shell-ward': 'M24 137Q21 53 100 24Q179 53 176 137M43 136Q39 75 100 47Q161 75 157 136M38 146Q100 177 162 146M54 92 72 108M146 92 128 108',
  'spore-spiral': 'M23 141C65 173 159 150 166 96C174 43 78 21 46 60C18 91 60 126 105 108M66 70A9 9 0 1 0 66 88A9 9 0 1 0 66 70M132 58A7 7 0 1 0 132 72A7 7 0 1 0 132 58M132 124A11 11 0 1 0 132 146A11 11 0 1 0 132 124',
  'mist-horns': 'M32 132C5 88 48 29 88 53C114 69 91 102 73 83M168 132C195 88 152 29 112 53C86 69 109 102 127 83M21 152Q100 191 179 152M34 169Q100 191 166 169',
  'prism-claws': 'M33 159 92 51 83 132 157 27 137 130 179 71 164 158M39 42 63 23 78 51 62 76ZM130 161 146 138 166 162 148 187Z',
  'steam-vents': 'M26 155C52 117 43 77 78 48C58 92 92 111 81 152M106 157C136 122 123 69 157 34C140 81 179 111 160 146M21 164Q100 189 179 157',
  'clockwork-threads': 'M27 100H173M100 27V173M45 45 155 155M45 155 155 45M100 21 108 37 128 35 134 54 153 60 151 80 172 91 164 110 174 129 156 141 154 161 132 163 121 182 100 174 79 182 68 163 46 161 44 141 26 129 36 110 28 91 49 80 47 60 66 54 72 35 92 37Z',
  'bell-resonance': 'M100 30Q62 32 60 95L45 126H155L140 95Q138 32 100 30ZM83 143Q100 161 117 143M27 59Q8 100 27 141M173 59Q192 100 173 141',
  'paper-seal': 'M35 37H78V69H119V103H163V157H122V125H81V91H35ZM57 54 142 141M71 157H44V130M130 27H157V54',
  'eclipse-claws': 'M130 23A80 80 0 1 0 172 144A70 70 0 0 1 130 23M45 150 130 58M61 167 149 75M29 129 111 40',
  'ink-roots': 'M21 174C52 145 37 113 85 99S118 48 153 28M63 184C89 153 79 122 135 108S154 63 180 53M40 127Q15 100 30 79M131 112Q163 131 177 111',
  'empty-aegis': 'M100 24A75 75 0 1 1 99.9 24M100 44A55 55 0 1 0 100.1 44M50 154Q100 182 150 154M100 60 108 89 138 100 108 111 100 140 92 111 62 100 92 89Z',
  'royal-frost-wave': 'M15 143C48 43 90 34 107 91S155 127 185 45M16 163C57 82 79 79 100 127S159 164 184 89M37 151 48 108 60 153M133 154 147 105 158 148',
  'crystal-crown': 'M26 146 43 60 72 109 100 22 128 109 157 60 174 146ZM43 155H157M63 66 71 20 79 66M121 66 129 20 137 66M100 48V133',
  'judgment-resonance': 'M100 18A82 82 0 1 1 99.9 18M100 40A60 60 0 1 0 100.1 40M100 66 134 100 100 134 66 100ZM29 100H171M100 5V49M100 151V195',
  'five-oath-tablets': 'M28 49 42 31 56 49V95H28ZM65 28 79 10 93 28V74H65ZM108 22 122 4 136 22V68H108ZM147 41 161 23 175 41V87H147ZM85 123 100 105 115 123V168H85ZM25 136Q100 190 175 136',
};
const B_SIGN_ALIASES = {
  'leaf-arrow': 'arrow-volley', 'tide-arrow': 'tidal-lance', 'piercing-cone': 'wind-lance',
  'amber-cleave': 'twin-crescents', 'crimson-cleave': 'void-cleave', 'spectral-cleave': 'twin-crescents',
  'commander-impact': 'earth-split', 'occult-seal': 'venom-seal', 'covenant-oracle': 'judgment-resonance',
  'water-gates': 'tidal-lance',
};

function BSignature({ motif, core, opacity = .8 }) {
  const shape = B_SIGNS[motif] || B_SIGNS[B_SIGN_ALIASES[motif]] || B_SIGNS.sanctuary;
  return <path className="vfx-b-signature" d={shape} fill="none" stroke={core} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />;
}

const B_RIBBONS = {
  fire: 'M2 100C73 12 153 187 222 95S302 23 358 100M6 109C75 181 156 16 231 100S308 170 358 100',
  wind: 'M2 100C91 16 219 14 358 100M2 100C94 161 245 172 358 100M22 102Q171 55 351 100',
  lightning: 'M2 100 55 78 79 112 126 52 151 101 200 65 224 119 282 76 310 104 358 100',
  ice: 'M2 100 133 76 303 83 358 100 303 117 133 124ZM117 88 206 38 196 88M154 115 242 164 226 115',
  shadow: 'M2 100C77 12 224 13 358 100M7 101C121 181 275 161 358 100M83 125Q212 63 329 91',
  earth: 'M2 100 87 130 159 81 211 125 289 86 358 100M56 140 111 153 145 119M197 77 233 53 279 74',
  martial: 'M2 100Q120 25 358 100M2 100Q120 175 358 100M110 64Q171 100 110 136M222 76Q270 100 222 124',
  water: 'M2 100C80 180 144 21 222 99S309 171 358 100M2 100C89 20 154 181 235 100S304 27 358 100',
  nature: 'M2 100C87 134 97 30 162 71S228 164 284 107 330 80 358 100M61 102Q64 55 106 62M212 107Q226 152 268 143',
  poison: 'M2 100C77 27 143 172 216 94S304 44 358 100M23 122Q114 174 183 111T338 113',
  music: 'M2 100C50 41 76 159 120 100S183 41 224 100 283 158 322 100 343 82 358 100M85 45Q135 100 85 155M215 54Q263 100 215 146',
  heal: 'M2 100C90 44 150 158 220 98S305 59 358 100M2 100C90 148 155 43 225 102S305 144 358 100',
  guard: 'M2 100Q150 23 358 100M2 100Q150 177 358 100M217 42Q265 100 217 158',
  holy: 'M2 100Q125 31 358 100M2 100Q125 169 358 100M170 43 205 100 170 157M256 64 278 100 256 136',
};
const B_MELEE_ARCS = {
  fire: 'M180 100C132 174 17 163 27 79C36 7 168 1 281 46C344 71 333 137 278 163C235 184 202 151 180 100M180 100C230 35 325 50 321 107C315 165 192 195 78 155',
  wind: 'M180 100C275 159 330 102 300 53C260 6 98 3 25 143C104 89 167 64 180 100M180 100C118 172 24 164 23 107',
  shadow: 'M180 100C75 188 8 136 36 64C71-1 224 7 333 151C264 106 201 66 180 100M180 100C265 22 338 62 327 129',
  earth: 'M180 100 137 154 62 173 22 140 49 64 137 23 246 32 330 91 307 156 230 177 180 100M180 100 245 61 302 75M112 149 100 177',
  martial: 'M180 100C256 23 337 67 318 128C292 201 99 195 29 103M180 100C104 177 23 133 42 72C68-1 261 5 331 97',
  ice: 'M180 100 105 147 33 133 78 62 184 20 304 45 328 115 253 162 180 100M102 63 88 20 143 44M258 153 292 185 311 136',
  guard: 'M180 100Q286 36 330 100Q297 186 156 166Q52 160 29 100Q62 16 202 34Q276 44 296 74',
  holy: 'M180 100C262 173 344 121 314 60C276-6 111 4 26 141C108 88 163 68 180 100M58 138 83 158M254 35 283 48',
  water: 'M180 100C105 171 9 148 35 69C63-1 218 13 322 134C277 185 198 168 180 100M180 100C263 27 339 72 309 128',
};
const B_MOTIF_RIBBONS = {
  'phoenix-arrow': 'M2 100Q133 143 254 104Q174 76 126 24Q248 40 291 89L358 100 291 111Q248 160 126 176Q174 124 254 96',
  'arrow-volley': 'M2 100Q151 33 358 74M2 100H358M2 100Q151 167 358 126',
  'precision-bolt': 'M2 100H358M74 65Q111 100 74 135M169 55Q215 100 169 145M276 68Q309 100 276 132',
  'water-gates': 'M2 100C91 30 153 28 193 77M2 100C91 170 153 172 193 123M192 78Q237 23 283 59T358 100M192 122Q237 177 283 141T358 100',
  'paper-seal': 'M2 100H67V62H118V101H174V143H224V102H279V61H319V100H358',
  'clockwork-threads': 'M2 100H358M62 70 92 100 62 130M159 58 201 100 159 142M262 70 292 100 262 130',
};

function BReleaseRibbon({ visual }) {
  const path = visual.melee ? B_MELEE_ARCS[visual.theme] || B_MELEE_ARCS.martial
    : B_MOTIF_RIBBONS[visual.motif] || B_RIBBONS[visual.theme] || B_RIBBONS.wind;
  return <svg viewBox="0 0 360 200" preserveAspectRatio="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} stroke={visual.color} strokeWidth="13" opacity=".18" />
    <path d={path} stroke={visual.color} strokeWidth="5.8" opacity=".88" />
    <path d={path} stroke={visual.core} strokeWidth="1.8" opacity=".94" />
  </svg>;
}

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
  return <div className="skill-spectacle skill-spectacle-b" data-skill-theme={visual.theme} data-b-motif={visual.motif} data-b-identity={visual.identity} data-b-support={String(Boolean(visual.support))} aria-hidden="true" style={{ color: visual.color }}>
    <div className="vfx-charge" data-vfx-phase="charge" data-vfx-anchor="attacker">
      <svg viewBox="0 0 200 200" fill="none">
        <LightPaint id={`${id}-charge`} color={visual.color} core={visual.core} />
        <LightPaint id={`${id}-contact`} color={visual.color} core={visual.core} />
        <ellipse cx="100" cy="151" rx="69" ry="20" fill={`url(#${id}-charge-core)`} />
        <g className="vfx-spin" stroke="currentColor">
          <ellipse cx="100" cy="151" rx="70" ry="19" strokeWidth="2.1" strokeDasharray="54 9 10 9" />
          <ellipse cx="100" cy="151" rx="55" ry="14" strokeWidth="1.1" />
          <path d="M29 151H41M159 151H171M100 132V141M100 162V171M61 137 68 141M139 137 132 141M58 164 68 160M142 164 132 160" strokeWidth="2" />
        </g>
        <path className="vfx-plume" d="M53 139Q52 112 76 94M148 139Q150 107 127 85M78 131Q74 105 94 70M123 128Q127 99 110 51" stroke={`url(#${id}-charge-ribbon)`} strokeWidth="3" strokeLinecap="round" />
        {[[70, 81], [125, 69], [103, 40], [143, 111]].map(([x, y], index) => <path key={index} d={star} transform={`translate(${x} ${y}) scale(${index % 2 ? .7 : .5})`} fill={visual.core} />)}
        <BSignature motif={visual.motif} core={visual.core} opacity={visual.support ? .66 : .48} />
      </svg>
    </div>
    {visual.ribbons?.map((ribbon, index) => <div key={index} className="vfx-b-release" data-vfx-phase="release" data-vfx-anchor="weapon" data-vfx-release={index}><BReleaseRibbon visual={visual} /></div>)}
    {visual.bursts.map((burst, index) => <div key={index} className={`vfx-burst vfx-${visual.theme}`} data-vfx-phase="contact" data-vfx-anchor="target" data-vfx-index={index}>
      <svg viewBox="0 0 200 200" fill="none">
        <ContactShape theme={burst.kind} id={`${id}-contact`} core={visual.core} />
        <BSignature motif={visual.motif} core={visual.core} />
      </svg>
    </div>)}
  </div>;
}

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
    {/* 짧은 발톱과 권격은 점선 사이에서도 속성색 윤곽이 이어져 보이도록 합니다. */}
    <path className="vfx-weapon-contour" d="M-23-14Q-6-23 17-11M-25 0Q-4-7 22 2M-20 14Q-4 9 17 16" stroke={visual.color} strokeWidth={kind === 'claw' ? 9 : 10} opacity=".28" />
    <path className="vfx-weapon-flow" d="M-23-14Q-6-23 17-11M-25 0Q-4-7 22 2M-20 14Q-4 9 17 16" stroke={energy} strokeWidth={kind === 'claw' ? 6 : 7} strokeDasharray="14 7" />
    <path className="vfx-weapon-core" d="M-18-13Q-4-17 14-10M-20 0Q-3-3 17 2M-15 13Q-2 11 13 15" stroke={visual.core} strokeWidth="2.3" />
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
    const sourcePose = resolveCombatPose(unitKey, pose === 'skill' ? skillFrame : pose);
    const anchor = getSkillAuraAnchor(unitKey, sourcePose, plan.weapon);
    const kind = WEAPON_KINDS[anchor.kind] || anchor.kind;
    const style = pose === 'skill' && plan.skillPose ? { '--combat-sprite-scale': plan.skillPose.scale, '--combat-foot-offset': plan.skillPose.footOffset || '0%' } : getCombatFrameStyle(unitKey, sourcePose);
    const id = `weapon-${unique}-${pose}`;
    return <svg key={pose} className="vfx-weapon-aura" viewBox="0 0 512 512" data-vfx-phase="weapon" data-vfx-anchor="weapon" data-pose={pose} data-grip={anchor.grip.join(',')} data-tip={anchor.tip.join(',')} data-focus={anchor.focus?.join(',')} data-vfx-kind={kind} data-kind={anchor.kind} data-vfx-unit={unitKey} data-anchor-origin={anchor.origin} data-anchor-authored={String(anchor.authored)} data-anchor-reviewed={String(Boolean(anchor.reviewed))} style={{ ...style, color: visual.color }} aria-hidden="true">
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
    const sourcePose = resolveCombatPose(unitKey, pose === 'skill' ? skillFrame : pose);
    const anchor = getSkillAuraAnchor(unitKey, sourcePose, plan.weapon);
    const [x, y] = anchor.grip;
    const length = Math.hypot(anchor.tip[0] - x, anchor.tip[1] - y);
    const angle = Math.atan2(anchor.tip[1] - y, anchor.tip[0] - x) * 180 / Math.PI;
    const style = pose === 'skill' && plan.skillPose ? { '--combat-sprite-scale': plan.skillPose.scale, '--combat-foot-offset': plan.skillPose.footOffset || '0%' } : getCombatFrameStyle(unitKey, sourcePose);
    const id = `blade-${unique}-${pose}`;
    return <svg key={pose} className="vfx-blade-aura" viewBox="0 0 512 512" data-vfx-phase="weapon" data-vfx-anchor="weapon" data-pose={pose} data-grip={anchor.grip.join(',')} data-tip={anchor.tip.join(',')} data-kind="blade" data-vfx-kind="blade" data-vfx-unit={unitKey} data-anchor-origin={anchor.origin} data-anchor-authored={String(anchor.authored)} data-anchor-reviewed={String(Boolean(anchor.reviewed))} style={style} aria-hidden="true">
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
