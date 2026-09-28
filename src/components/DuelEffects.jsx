import { getCombatEffect, getCombatMotionSprite } from '../data/combatArt.js';

function EffectShape({ effect }) {
  const {shape,variant}=effect;
  if(['flame','embers','dragon','phoenix'].includes(shape))return <>
    {shape==='dragon'&&<path className="duel-stroke" d="M 30 180 C 170 150 10 115 140 82 S 145 28 175 15" strokeWidth="13" />}
    {shape==='phoenix'&&<path d="M100 170Q25 138 6 40Q64 48 100 105Q136 48 194 40Q175 138 100 170" fill="currentColor" opacity=".65" />}
    <image href={getCombatEffect('fire')} x="0" y="0" width="200" height="200" />
  </>;
  if(shape==='arrow')return <>
    {variant==='flame'&&<><path d="M175 99Q104 83 9 93L43 100L6 106Q98 117 175 101" fill="currentColor" opacity=".55"/><path d="M32 100Q105 91 172 100" stroke="#fff4c4" strokeWidth="2"/></>}
    <path d="M12 100H179" stroke="#a89471" strokeWidth="2" /><path d="M17 100L4 95H30L42 100L30 105H4Z" fill="#e4e1c7" stroke="#817a63" strokeWidth="1" />
    <path d="M194 100L176 95L181 100L176 105Z" fill="#fff7dc" stroke="currentColor" strokeWidth="1" />
    <path d="M46 99H169" stroke="#f7f4df" strokeWidth="1" />
  </>;
  if(shape==='slash'||shape==='crescent')return <><path className="duel-stroke" d="M 32 176 C 164 148 164 44 66 14 C 192 57 185 161 32 176" fill="currentColor" strokeWidth="1" opacity=".85" /><path d="M39 173C167 132 157 49 72 19" stroke="#fffbea" strokeWidth="3" /></>;
  if(shape==='lance'||shape==='blade')return <><path d={shape==='blade'?'M100 5L119 157L100 195L81 157Z':'M7 95L155 90L196 100L155 110L7 105Z'} fill="currentColor" opacity=".8"/><path d={shape==='blade'?'M100 12V185':'M13 100H184'} stroke="#fffbed" strokeWidth="3"/></>;
  if(shape==='impact')return <><path d="M100 17L108 82L151 54L122 95L185 107L119 116L148 157L105 131L85 185L85 126L30 139L73 107L17 74L82 89Z" fill="currentColor" opacity=".88"/><path d="M100 52L105 94L140 102L105 110L93 148L91 111L55 99L91 94Z" fill="#fff9e2"/></>;
  if(shape==='lightning')return <><path className="duel-stroke" d="M90 0L64 61L120 54L82 115L128 104L96 200M118 55L154 75L137 102M81 117L49 148L65 173" strokeWidth="9"/><path d="M90 0L64 61L120 54L82 115L128 104L96 200" stroke="#fcffff" strokeWidth="3"/></>;
  if(shape==='chain')return <path className="duel-stroke" d="M10 108L35 91L53 111L79 89L101 106L128 88L149 107L171 91L190 102" strokeWidth="4"/>;
  if(shape==='claw')return <>{[-1,0,1].map(n=><path key={n} className="duel-stroke" d="M151 28Q94 96 42 157Q96 134 151 28" transform={`translate(${n*22} ${n*6})`} fill="currentColor" strokeWidth="1"/>)}</>;
  if(shape==='whip')return <><path className="duel-stroke" d="M8 155Q38 15 152 32Q209 39 166 112Q150 139 103 155" strokeWidth="4"/><path d="M160 95L169 115L184 105" stroke="#f6e3be" strokeWidth="2"/></>;
  if(['ice','icicles','shards'].includes(shape))return <>{(shape==='ice'?[0]:[-2,-1,0,1,2]).map((n)=><g key={n} transform={`translate(${n*27} ${Math.abs(n)*14}) rotate(${shape==='shards'?n*32:shape==='ice'?90:0} 100 100)`}><path d="M100 10L119 132L100 184L81 132Z" fill="currentColor" opacity=".7" strokeWidth="2"/><path d="M100 13L105 128L100 180L95 128Z" fill="#f0ffff" opacity=".85"/></g>)}</>;
  if(shape==='shield'||shape==='plates')return <>{(shape==='plates'?[-1,0,1]:[0]).map(n=><g key={n} transform={`translate(${n*49} ${Math.abs(n)*12}) scale(${shape==='plates'?.68:1})`}><path className="duel-stroke" d={variant==='hex'?'M100 8L174 51V145L100 191L26 145V51Z':'M100 12L174 40L161 132Q145 170 100 193Q55 170 39 132L26 40Z'} fill="currentColor" fillOpacity=".13" strokeWidth="4"/><path d="M100 31V168M58 88H142" stroke="#f5fff4" strokeWidth="2"/><path d="M100 38L150 56L141 125L100 168L59 125L50 56Z" strokeWidth="1"/></g>)}</>;
  if(shape==='sight')return <><path d="M63 30H30V63M137 30H170V63M30 137V170H63M137 170H170V137M100 63V137M63 100H137" strokeWidth="3"/><circle cx="100" cy="100" r="25" strokeWidth="1"/></>;
  if(shape==='cross')return <><path d="M91 22H109V85H159V104H109V178H91V104H41V85H91Z" fill="currentColor" stroke="#fffbea" strokeWidth="2"/></>;
  if(shape==='moon')return <path d="M135 18A82 82 0 1 0 169 144A73 73 0 0 1 135 18Z" fill="currentColor" stroke="#f8faff" strokeWidth="2"/>;
  if(shape==='rays')return <>{[-2,-1,0,1,2].map(n=><path key={n} d={`M${100+n*12} 186L${100+n*32} 6L${109+n*32} 6L${105+n*12} 186Z`} fill="currentColor" opacity={.45-Math.abs(n)*.08}/>)}</>;
  if(shape==='notes')return <>{[0,1,2,3].map(n=><g key={n} transform={`translate(${n*40-25} ${n%2?32:-18}) scale(.6)`}><ellipse cx="44" cy="154" rx="17" ry="11" fill="currentColor" transform="rotate(-20 44 154)"/><path d="M59 152V74L106 64V135M60 90L106 80" strokeWidth="5"/><ellipse cx="91" cy="137" rx="17" ry="11" fill="currentColor" transform="rotate(-20 91 137)"/></g>)}</>;
  if(shape==='petals'||shape==='feathers'||shape==='motes')return <>{Array.from({length:9},(_,n)=><g key={n} transform={`translate(${20+n%3*59} ${20+Math.floor(n/3)*61}) rotate(${n*47})`}><path d={shape==='feathers'?'M0 0Q26 -37 14 -50Q-15 -27 0 0M0 0L12 -44':shape==='petals'?'M0 0Q30 -8 12 -32Q-12 -25 0 0':'M0 -11L3 -3L11 0L3 3L0 11L-3 3L-11 0L-3 -3Z'} fill="currentColor" fillOpacity=".65" strokeWidth="1"/></g>)}</>;
  if(shape==='debris'||shape==='dust')return <>{Array.from({length:7},(_,n)=><path key={n} d="M-9 -6L3 -11L11 2L3 10L-10 5Z" transform={`translate(${20+n*26} ${90+(n%3)*24}) rotate(${n*39}) scale(${shape==='dust'?.6:1})`} fill="currentColor" opacity=".65"/>)}</>;
  if(shape==='cracks')return <path d="M100 100L22 128L5 165M100 100L62 70L24 55M100 100L133 141L172 152M100 100L157 83L194 36M61 118L52 163M136 92L140 59" strokeWidth="5"/>;
  if(shape==='frost')return <><path d="M5 145Q42 71 69 116T123 102T198 96L188 159H5Z" fill="currentColor" opacity=".5"/>{[0,1,2,3,4].map(n=><path key={n} d={`M${15+n*36} 151L${30+n*36} ${74+(n%2)*20}L${46+n*36} 151Z`} fill="#e4faff" opacity=".75"/>)}</>;
  if(['pressure','soundwave','wind'].includes(shape))return <>{[0,1,2].map(n=><path className="duel-stroke" key={n} d={shape==='wind'?`M8 ${76+n*20}Q78 ${37+n*27} 190 ${58+n*32}`:`M${65+n*29} 18Q${163+n*16} 100 ${65+n*29} 182`} strokeWidth={shape==='soundwave'?5:3} opacity={.85-n*.15}/>)}</>;
  if(shape==='runes')return <><path d="M40 38H78V72H113V113H161M55 145H92V115M131 30V64H165M32 101H54M120 154H155V181" strokeWidth="3"/><path d="M78 72L113 113M92 115L120 154" strokeWidth="1"/></>;
  if(shape==='shell'||shape==='vial')return <>{shape==='vial'?<path d="M83 27H117V62L149 118Q158 163 100 169Q42 163 51 118L83 62Z" fill="currentColor" fillOpacity=".6" stroke="#e9f4d4" strokeWidth="4"/>:<ellipse cx="110" cy="100" rx="47" ry="27" fill="currentColor" stroke="#fff1da" strokeWidth="3"/>}<path d="M59 97H4M55 112H18M66 81H26" strokeWidth="4"/></>;
  if(shape==='fist')return <><path d="M19 75L61 55L91 68L112 61L130 73L155 74L178 104L165 136L118 149L59 135L22 116Z" fill="currentColor" fillOpacity=".48" strokeWidth="3"/><path d="M59 80L99 98L105 131M113 77L127 116M140 86L151 112" stroke="#fff5d8" strokeWidth="2"/></>;
  if(shape==='tiger')return <><path d="M32 45L51 16L79 38H122L151 16L170 45L163 124L131 172L100 187L69 172L37 124Z" fill="currentColor" fillOpacity=".18" strokeWidth="4"/><path d="M58 71L84 91L64 99M141 71L117 91L138 99M85 124L100 138L117 124M73 146L100 163L128 146M100 40V83" strokeWidth="5"/></>;
  return null;
}

export default function DuelEffects({plan,unitKey}){
  return <div className="duel-effects" aria-hidden="true">
    {plan.effects.map((effect,index)=><div key={index} data-duel-effect={index} data-shape={effect.shape} className={`duel-effect effect-${effect.shape}`} style={{color:effect.color}}>
      {effect.shape==='echo' ? <img src={plan.skillPose?.src||getCombatMotionSprite(unitKey,'strike')} alt=""/> : <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><EffectShape effect={effect}/></svg>}
    </div>)}
  </div>;
}
