import { useLayoutEffect } from 'react';
import { getImpactParticle } from '../data/duelPerformance.js';
import { animateSkillSpectacle } from './animateSkillSpectacle.js';

const clamp=value=>Math.max(0,Math.min(1,value));
export function useDuelAnimation(ref,plan,duration,{enabled,shake,miss,support,finish,selfSupport}){
  useLayoutEffect(()=>{
    const root=ref.current,media=matchMedia('(prefers-reduced-motion: reduce)');
    if(!root)return;
    const arena=root.querySelector('.painted-combat-arena'),attacker=root.querySelector('.fighter-attacker'),defender=root.querySelector('.fighter-defender');
    let animations=[],active=true;
    const stop=()=>{animations.forEach(animation=>animation.cancel());animations=[];};
    const start=()=>{
      if(!active)return;
      const elapsed=animations[0]?.currentTime||0,paused=animations[0]?.playState==='paused';stop();
      root.classList.toggle('duel-motion-disabled',!enabled||media.matches);
      if(!enabled||media.matches)return;
      const separation = defender ? defender.offsetLeft - attacker.offsetLeft : 0;
      const spacing = plan.weapon === 'thrust' || plan.weapon === 'whip' ? .65 : .51;
      root.style.setProperty('--combat-reach', `${Math.max(0, separation - attacker.offsetWidth * spacing)}px`);
      const animate=(element,frames,options={})=>{
        if(!element)return;
        const animation=element.animate([...frames].sort((a,b)=>a.offset-b.offset),{duration,fill:'both',easing:'linear',...options});
        animation.currentTime=elapsed;if(paused)animation.pause();animations.push(animation);
      };
      animate(attacker,plan.actor.map(([offset,x,y])=>({offset,transform:`translateX(calc(var(--combat-reach) * ${x})) translateY(${y}%)`,easing:'cubic-bezier(.3,.65,.4,1)'})));
      animate(attacker.querySelector('.fighter-body'),plan.body.map(([offset,angle,sx,sy])=>({offset,transform:`rotate(${angle}deg) scale(${sx},${sy})`,easing:'cubic-bezier(.22,.65,.35,1)'})));
      animate(attacker.querySelector('.fighter-shadow'),plan.actor.map(([offset,,height])=>({offset,opacity:height < -3 ? .45 : .85,transform:`scale(${height < -3 ? .76 : 1.04},${height < -3 ? .7 : 1})`})));
      for(const image of attacker.querySelectorAll('.fighter-frame')){
        const pose=image.dataset.pose;
        animate(image,[...plan.poses.map(([offset,active])=>({offset,opacity:pose===active?1:0,easing:'steps(1,end)'})),{offset:1,opacity:pose==='ready'?1:0}]);
      }
      const impact=plan.impact;
      if(defender){
        let recoil=[{offset:0,transform:'none'},{offset:1,transform:'none'}];
        if(miss)recoil=[{offset:0,transform:'none'},{offset:impact-.12,transform:'none'},{offset:impact,transform:'translateX(12%) rotate(4deg)'},{offset:impact+.1,transform:'translateX(12%) rotate(4deg)'},{offset:.91,transform:'none'},{offset:1,transform:'none'}];
        else if(!support){
          recoil=[{offset:0,transform:'none'},...plan.contacts.flatMap(at=>[{offset:at-.008,transform:'none'},{offset:at+.012,transform:`translateX(${plan.skill?7:4}%) rotate(3deg)`},{offset:at+.035,transform:`translateX(${plan.skill?7:4}%) rotate(3deg)`}]),{offset:.87,transform:'none'},{offset:1,transform:'none'}];
        }
        animate(defender,recoil);
        if(!support&&!miss){
          const body=[{offset:0,transform:'none'},...plan.contacts.flatMap(at=>[
            {offset:at-.025,transform:'rotate(-2deg) scale(1.01,.99)'},
            {offset:at+.008,transform:`rotate(${plan.skill?8:5}deg) scale(.99,.97)`},
            {offset:at+.03,transform:`rotate(${plan.skill?8:5}deg) scale(.99,.97)`},
            {offset:at+.065,transform:'rotate(2deg) scale(1.01,.99)'}]),{offset:.89,transform:'none'},{offset:1,transform:'none'}];
          if(!finish)animate(defender.querySelector('.fighter-body'),body);
          animate(defender.querySelector('.fighter-poses'),[{offset:0,filter:'brightness(1)'},...plan.contacts.flatMap(at=>[
            {offset:at-.001,filter:'brightness(1)'},{offset:at+.008,filter:'brightness(1.65) saturate(.5)'},
            {offset:at+.04,filter:'brightness(1)'}]),{offset:1,filter:'brightness(1)'}]);
        }
        for(const image of defender.querySelectorAll('.fighter-frame')){
          const pose=image.dataset.pose;
          const active=support?'ready':miss?'evade':'recoil';
          const frames=[{offset:0,opacity:pose==='ready'?1:0,easing:'steps(1,end)'}];
          if(!support){
            const contacts=miss?[impact-.06]:plan.contacts;
            for(const [index,at]of contacts.entries()){
              frames.push({offset:at,opacity:pose===active?1:0,easing:'steps(1,end)'});
              const recovery=Math.min(at+.07,.86);
              if(index===contacts.length-1||recovery<contacts[index+1])frames.push({offset:recovery,opacity:pose===(finish?'recoil':'ready')?1:0,easing:'steps(1,end)'});
            }
          }
          frames.push({offset:1,opacity:pose===(finish&&!support&&!miss?'recoil':'ready')?1:0});animate(image,frames);
        }
        if(finish&&!support&&!miss)animate(defender.querySelector('.fighter-body'),[{offset:0,transform:'none',opacity:1},{offset:impact,transform:'none',opacity:1},{offset:.81,transform:'translateY(6%) rotate(12deg)',opacity:1},{offset:1,transform:'translateY(10%) rotate(18deg)',opacity:0}]);
      }
      const target=selfSupport?attacker:defender||attacker;
      const a=attacker.offsetLeft+attacker.offsetWidth*.55,d=target.offsetLeft+target.offsetWidth*.46;
      const ground=arena.clientHeight-parseFloat(getComputedStyle(target).bottom);
      const ay=arena.clientHeight-parseFloat(getComputedStyle(attacker).bottom)-attacker.offsetWidth*.37;
      const dy=ground-target.offsetWidth*.37;
      for(const [index,impact]of plan.impacts.entries()){
        const hit=root.querySelector(`[data-duel-impact="${index}"]`);
        hit.style.visibility=miss?'hidden':'';
        hit.style.left=`${d}px`;hit.style.top=`${dy}px`;
        hit.style.setProperty('--hit-size',`${Math.min(95,attacker.offsetWidth*.4)*impact.strength}px`);
        const at=impact.at;
        animate(hit,[{offset:0,opacity:0},{offset:at,opacity:0},{offset:at+.003,opacity:1},{offset:at+.17,opacity:1},{offset:at+.20,opacity:0},{offset:1,opacity:0}]);
        animate(hit.querySelector('.hit-core'),[{offset:0,transform:'translate(-50%,-50%) scale(.1)',opacity:0},
          {offset:at,transform:'translate(-50%,-50%) scale(.1)',opacity:1},{offset:at+.015,transform:'translate(-50%,-50%) scale(1.1)',opacity:1},
          {offset:at+.08,transform:'translate(-50%,-50%) scale(.65)',opacity:0},{offset:1,opacity:0}]);
        animate(hit.querySelector('.hit-pressure'),[{offset:0,transform:'translate(-50%,-50%) scale(.2)',opacity:0},
          {offset:at,transform:'translate(-50%,-50%) scale(.2)',opacity:.8},{offset:at+.12,transform:'translate(-50%,-50%) scale(1.75)',opacity:0},{offset:1,opacity:0}]);
        for(const [particle,node]of [...hit.querySelectorAll('.hit-particle')].entries()){
          const p=getImpactParticle(impact,particle),start=at+p.delay;
          const unit=Math.min(1.5,attacker.offsetWidth/170);
          const transform=(x,y,scale)=>`translate(${x*unit}px,${y*unit}px) rotate(${p.angle}deg) scale(${scale})`;
          animate(node,[{offset:0,opacity:0,transform:transform(0,0,.5)},{offset:start,opacity:1,transform:transform(0,0,.5)},
            {offset:start+.055,opacity:1,transform:transform(p.x*.7,p.y*.7,1)},
            {offset:p.end,opacity:0,transform:transform(p.x,p.y+p.gravity,.3)},{offset:1,opacity:0}]);
        }
        animate(hit.querySelector('.hit-chain'),[{offset:0,opacity:0,transform:'translate(-50%,-100%)'},
          {offset:at,opacity:0,transform:'translate(-50%,-100%)'},{offset:at+.025,opacity:1,transform:'translate(-50%,-140%)'},
          {offset:at+.12,opacity:0,transform:'translate(-50%,-180%)'},{offset:1,opacity:0}]);
      }
      for(const [index,at]of plan.footfalls.entries()){
        const dust=root.querySelector(`[data-footfall="${index}"]`);
        const segment=plan.actor.findIndex(([t])=>t>=at),before=plan.actor[Math.max(0,segment-1)],after=plan.actor[Math.max(0,segment)];
        const t=after[0]===before[0]?0:(at-before[0])/(after[0]-before[0]);
        const x=before[1]+(after[1]-before[1])*t;
        dust.style.left=`${a+x*parseFloat(root.style.getPropertyValue('--combat-reach'))}px`;
        dust.style.top=`${arena.clientHeight-parseFloat(getComputedStyle(attacker).bottom)}px`;
        animate(dust,[{offset:0,opacity:0,transform:'scale(.35)'},{offset:at,opacity:0,transform:'scale(.35)'},{offset:at+.004,opacity:.4,transform:'scale(.35)'},
          {offset:Math.min(.99,at+.085),opacity:0,transform:'translateY(-7px) scale(1.5)'},{offset:1,opacity:0}]);
      }
      const point=([fraction,y])=>[a+(d-a)*fraction,ay+(dy-ay)*fraction+y*arena.clientHeight];
      for(const [index,effect]of plan.effects.entries()){
        const element=root.querySelector(`[data-duel-effect="${index}"]`);
        const isTravel=Math.abs(effect.from[0]-effect.to[0])>.1;
        const isContact=plan.contacts.some(at=>Math.abs(effect.at-at)<=.06);
        if(miss&&isContact&&!isTravel){element.style.visibility='hidden';continue;}
        element.style.visibility='';
        const from=point(effect.from),to=point(effect.to);
        if(miss&&isTravel){to[0]+=attacker.offsetWidth*.25;to[1]-=attacker.offsetWidth*.09;}
        const size=attacker.offsetWidth*effect.size;
        element.style.width=`${size}px`;element.style.height=`${size}px`;
        const transform=(x,y,scale,angle)=>`translate(${x}px,${y}px) translate(-50%,-50%) rotate(${angle}deg) scale(${scale})`;
        const at=effect.at,end=Math.min(effect.until,.98),mid=at+(end-at)*.55;
        const opacity=effect.shape==='echo'?.23:1;
        const lastScale=['arrow','lance','ice','shell','vial'].includes(effect.shape)?1:1.12;
        const first=transform(...from,isTravel?.8:.45,effect.angle-(isTravel?0:18));
        const final=transform(...to,lastScale,effect.angle);
        animate(element,[{offset:0,opacity:0,transform:first},{offset:at,opacity:0,transform:first},
          {offset:at+.007,opacity,transform:first},
          {offset:mid,opacity,transform:transform((from[0]+to[0])*.5,(from[1]+to[1])*.5+(effect.bend||0)*arena.clientHeight,1,effect.angle)},
          {offset:end,opacity:isTravel?opacity:0,transform:final},{offset:clamp(end+.012),opacity:0,transform:final},{offset:1,opacity:0,transform:final}]);
        for(const stroke of element.querySelectorAll('.duel-stroke'))animate(stroke,[{offset:0,strokeDashoffset:500},{offset:at,strokeDashoffset:500},{offset:mid,strokeDashoffset:0},{offset:1,strokeDashoffset:0}]);
      }
      animateSkillSpectacle(root,plan,{arena,attacker,a,d,dy,ground,miss},animate);
      if(shake&&!support&&!miss)animate(arena,[{offset:0,transform:'none'},...plan.contacts.flatMap(at=>[{offset:at-.003,transform:'none'},{offset:at+.008,transform:`translateX(-${plan.skill?2:1}px)`},{offset:at+.019,transform:`translateX(${plan.skill?2:1}px)`},{offset:at+.033,transform:'none'}]),{offset:1,transform:'none'}]);
    };
    start();
    const observer=new ResizeObserver(start);observer.observe(arena);
    media.addEventListener('change',start);
    return()=>{active=false;stop();observer.disconnect();media.removeEventListener('change',start);};
  },[ref,plan,duration,enabled,shake,miss,support,finish,selfSupport]);
}
