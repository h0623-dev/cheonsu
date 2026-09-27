import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import BossSplash from '../../src/components/BossSplash.jsx';
import '../../src/index.css';
const root=createRoot(document.getElementById('root'));
window.renderBossSplash=({key='boss_commander',phase=false,still=false,name='도적장'}={})=>{
  const boss={id:'boss',type:'boss',spriteKey:key,name,hp:300,maxHp:400,atk:42,def:28};
  flushSync(()=>root.render(<BossSplash key={`${key}-${phase}-${still}`} scene={{boss,type:phase?'phase2':'intro',title:name,subtitle:phase?'어둠의 파동이 전장을 뒤덮습니다.':'강력한 적장이 전장에 모습을 드러냈습니다.'}} effectsEnabled={!still} fallbackSrc="/art/bosses-v1/boss_commander-portrait.webp"/>));
};
window.renderBossSplash();
