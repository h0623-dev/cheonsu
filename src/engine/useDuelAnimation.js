import { useLayoutEffect } from 'react';

const clamp=value=>Math.max(0,Math.min(1,value));
export function useDuelAnimation(ref,plan,duration,{enabled,shake,miss,support,finish,selfSupport}){
  useLayoutEffect(()=>{
    const root=ref.current,media=matchMedia('(prefers-reduced-motion: reduce)');
    if(!root)return;
    const arena=root.querySelector('.painted-combat-arena'),attacker=root.querySelector('.fighter-attacker'),defender=root.querySelector('.fighter-defender');
    let animations=[];
    const stop=()=>{animations.forEach(animation=>animation.cancel());animations=[];};
    const start=()=>{
      const elapsed=animations[0]?.currentTime||0,paused=animations[0]?.playState==='paused';stop();
      root.classList.toggle('duel-motion-disabled',!enabled||media.matches);
      if(!enabled||media.matches)return;
      const animate=(element,frames,options={})=>{
        if(!element)return;
        const animation=element.animate([...frames].sort((a,b)=>a.offset-b.offset),{duration,fill:'both',easing:'linear',...options});
        animation.currentTime=elapsed;if(paused)animation.pause();animations.push(animation);
      };
      animate(attacker,plan.actor.map(([offset,x,y])=>({offset,transform:`translateX(calc(var(--combat-reach) * ${x})) translateY(${y}%)`,easing:'cubic-bezier(.3,.65,.4,1)'})));
      animate(attacker.querySelector('.fighter-body'),plan.actor.map(([offset,,,angle])=>({offset,transform:`rotate(${angle}deg)`,easing:'ease-in-out'})));
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
      if(shake&&!support&&!miss)animate(arena,[{offset:0,transform:'none'},...plan.contacts.flatMap(at=>[{offset:at-.003,transform:'none'},{offset:at+.008,transform:`translateX(-${plan.skill?2:1}px)`},{offset:at+.019,transform:`translateX(${plan.skill?2:1}px)`},{offset:at+.033,transform:'none'}]),{offset:1,transform:'none'}]);
    };
    start();
    const observer=new ResizeObserver(start);observer.observe(arena);
    media.addEventListener('change',start);
    return()=>{stop();observer.disconnect();media.removeEventListener('change',start);};
  },[ref,plan,duration,enabled,shake,miss,support,finish,selfSupport]);
}
