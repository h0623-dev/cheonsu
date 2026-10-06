import { useLayoutEffect } from 'react';
import { getImpactParticle, getDuelDefenderReaction, getDuelPoseAt, sampleDuelTrack } from '../data/duelPerformance.js';
import { getDuelWeaponAnchor, getDuelReach, projectDuelAnchor } from '../data/duelContactGeometry.js';
import { getCombatFrameStyle } from '../data/combatArt.js';
import { animateSkillSpectacle } from './animateSkillSpectacle.js';

const clamp=value=>Math.max(0,Math.min(1,value));
export function useDuelAnimation(ref,plan,duration,{enabled,shake,miss,support,finish,selfSupport,attackerKey}){
  useLayoutEffect(()=>{
    const root=ref.current,media=matchMedia('(prefers-reduced-motion: reduce)');
    if(!root)return;
    const arena=root.querySelector('.painted-combat-arena'),attacker=root.querySelector('.fighter-attacker'),defender=root.querySelector('.fighter-defender');
    if (!arena || !attacker) return;
    let animations=[],active=true;
    const startedAt = performance.now();
    const stop=()=>{animations.forEach(animation=>animation.cancel());animations=[];};
    const start=()=>{
      if(!active)return;
      const elapsed=animations[0]?.currentTime ?? Math.min(duration, performance.now() - startedAt),paused=animations[0]?.playState==='paused';stop();
      root.classList.toggle('duel-motion-disabled',!enabled||media.matches);
      if(!enabled||media.matches)return;
      const strikePose = plan.contactPose === 'strike' ? 'strike' : plan.skillPose?.src?.includes('skill-b') ? 'skill-b' : plan.skillPose ? 'skill-a' : 'strike';
      const skillFrameStyle = plan.skillPose ? { '--combat-sprite-scale': plan.skillPose.scale, '--combat-foot-offset': plan.skillPose.footOffset } : null;
      const frameStyle = plan.contactPose === 'strike' ? getCombatFrameStyle(attackerKey, 'strike') : skillFrameStyle || getCombatFrameStyle(attackerKey, strikePose);
      const anchor = getDuelWeaponAnchor(attackerKey, strikePose, plan.weapon);
      const scale = Number(frameStyle?.['--combat-sprite-scale']) || 1;
      const footOffset = (parseFloat(frameStyle?.['--combat-foot-offset']) || 0) / 100;
      const contactBody = sampleDuelTrack(plan.body, plan.impact);
      const reach = defender && plan.moving ? getDuelReach({ attackerLeft: attacker.offsetLeft, attackerWidth: attacker.offsetWidth, defenderLeft: defender.offsetLeft, defenderWidth: defender.offsetWidth, tip: anchor.tip, scale, footOffset, body: contactBody, advance: sampleDuelTrack(plan.actor, plan.impact)[0] }) : Math.max(0, defender ? defender.offsetLeft - attacker.offsetLeft - attacker.offsetWidth * .51 : 0);
      root.style.setProperty('--combat-reach', `${reach}px`);
      const animate=(element,frames,options={})=>{
        if(!element)return;
        const animation=element.animate([...frames].sort((a,b)=>a.offset-b.offset),{duration,fill:'both',easing:'linear',...options});
        animation.currentTime=elapsed;if(paused)animation.pause();animations.push(animation);
      };
      animate(attacker,plan.actor.map(([offset,x,y])=>({offset,transform:`translateX(calc(var(--combat-reach) * ${x})) translateY(${y}%)`,easing:'cubic-bezier(.3,.65,.4,1)'})));
      animate(attacker.querySelector('.fighter-body'),plan.body.map(([offset,angle,sx,sy])=>({offset,transform:`rotate(${angle}deg) scale(${sx},${sy})`,easing:'cubic-bezier(.22,.65,.35,1)'})));
      animate(attacker.querySelector('.fighter-shadow'),plan.actor.map(([offset,,height])=>({offset,opacity:height < -3 ? .45 : .85,transform:`scale(${height < -3 ? .76 : 1.04},${height < -3 ? .7 : 1})`})));
      for (const [index, echo] of (plan.afterimages || []).entries()) {
        const element = attacker.querySelector(`[data-action-echo="${index}"]`);
        const transform = distance => `translateX(${attacker.offsetWidth * distance}px) translateY(calc(6.25% + ${frameStyle?.['--combat-foot-offset'] || '0%'})) scale(${scale})`;
        animate(element, [{ offset: 0, opacity: 0, transform: transform(echo.distance) }, { offset: echo.at, opacity: 0, transform: transform(echo.distance) }, { offset: echo.at + .003, opacity: .24, transform: transform(echo.distance) }, { offset: echo.until, opacity: 0, transform: transform(echo.distance * 1.5) }, { offset: 1, opacity: 0 }]);
      }
      for(const image of attacker.querySelectorAll('.fighter-frame')){
        const pose=image.dataset.pose;
        animate(image,[...plan.poses.map(([offset,active])=>({offset,opacity:pose===active?1:0,easing:'steps(1,end)'})),{offset:1,opacity:pose==='ready'?1:0}]);
      }
      const impact=plan.impact;
      if(defender){
        const reaction = getDuelDefenderReaction(plan, { miss, support, finish });
        animate(defender,reaction.actor.map(([offset,x,y]) => ({ offset, transform: `translate(${x}%,${y}%)` })));
        if (!finish) animate(defender.querySelector('.fighter-body'), reaction.body.map(([offset,angle,sx,sy]) => ({ offset, transform: `rotate(${angle}deg) scale(${sx},${sy})` })));
        if(!support&&!miss){
          animate(defender.querySelector('.fighter-poses'),[{offset:0,filter:'brightness(1)'},...plan.contacts.flatMap(at=>[
            {offset:at-.001,filter:'brightness(1)'},{offset:at,filter:'brightness(1.4) saturate(.7)'},
            {offset:at+plan.contactPause,filter:'brightness(1.4) saturate(.7)'},{offset:at+plan.contactPause+.025,filter:'brightness(1)'}]),{offset:1,filter:'brightness(1)'}]);
        }
        for(const image of defender.querySelectorAll('.fighter-frame')){
          const pose=image.dataset.pose;
          const active=support?'ready':miss?'evade':'recoil';
          const frames=[{offset:0,opacity:pose==='ready'?1:0,easing:'steps(1,end)'}];
          if(!support){
            const contacts=miss?[impact-.06]:plan.contacts;
            for(const [index,at]of contacts.entries()){
              frames.push({offset:at,opacity:pose===active?1:0,easing:'steps(1,end)'});
              const recovery=Math.min(at+Math.max(.095,plan.contactPause+.065),.86);
              if(index===contacts.length-1||recovery<contacts[index+1])frames.push({offset:recovery,opacity:pose===(finish?'recoil':'ready')?1:0,easing:'steps(1,end)'});
            }
          }
          frames.push({offset:1,opacity:pose===(finish&&!support&&!miss?'recoil':'ready')?1:0});animate(image,frames);
        }
        if(finish&&!support&&!miss)animate(defender.querySelector('.fighter-body'),[{offset:0,transform:'none',opacity:1},{offset:impact-.001,transform:'none',opacity:1},{offset:impact,transform:'rotate(6deg) scale(.99,.98)',opacity:1},{offset:impact+plan.contactPause,transform:'rotate(6deg) scale(.99,.98)',opacity:1},{offset:.84,transform:'translateY(6%) rotate(12deg)',opacity:1},{offset:1,transform:'translateY(10%) rotate(18deg)',opacity:0}]);
      }
      const target=selfSupport?attacker:defender||attacker;
      const a=attacker.offsetLeft+attacker.offsetWidth*.55,d=target.offsetLeft+target.offsetWidth*.46;
      const ground=arena.clientHeight-parseFloat(getComputedStyle(target).bottom);
      const dy=ground-target.offsetWidth*.37;
      root.style.setProperty('--duel-contact-x', `${d / arena.clientWidth * 100}%`);
      root.style.setProperty('--duel-contact-y', `${dy / arena.clientHeight * 100}%`);
      animate(root.querySelector('.combat-result'), [{ offset: 0, opacity: 0, transform: 'translateY(10px) scale(.75)' }, { offset: impact, opacity: 0, transform: 'translateY(10px) scale(.75)' }, { offset: impact + .008, opacity: 1, transform: 'translateY(-5px) scale(1.15)' }, { offset: impact + .06, opacity: 1, transform: 'none' }, { offset: .88, opacity: 1, transform: 'none' }, { offset: 1, opacity: 0, transform: 'translateY(-12px)' }]);
      if (!support && !miss) animate(root.querySelector('.duel-impact-ink'), [{ offset: 0, opacity: 0 }, ...plan.contacts.flatMap(at => [{ offset: at - .001, opacity: 0 }, { offset: at, opacity: plan.skill ? .9 : .55 }, { offset: at + plan.contactPause, opacity: plan.skill ? .9 : .55 }, { offset: at + plan.contactPause + .018, opacity: 0 }]), { offset: 1, opacity: 0 }]);
      if (!support) {
        const at = plan.releases[0];
        animate(root.querySelector('.duel-action-lines'), [{ offset: 0, opacity: 0, transform: 'translateX(-8%) scaleX(.65)' }, { offset: at - .025, opacity: 0, transform: 'translateX(-8%) scaleX(.65)' }, { offset: at + .012, opacity: plan.skill ? .9 : .5, transform: 'none' }, { offset: impact + plan.contactPause + .045, opacity: 0, transform: 'translateX(9%) scaleX(1.08)' }, { offset: 1, opacity: 0 }]);
      }
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
      const weaponPoint = at => {
        const [x, y] = sampleDuelTrack(plan.actor, at);
        const activePose = getDuelPoseAt(plan, at);
        const sourcePose = activePose === 'skill' ? plan.skillPose?.src?.includes('skill-b') ? 'skill-b' : 'skill-a' : activePose === 'ready' ? 'recover' : activePose;
        const sourceStyle = activePose === 'skill' && plan.skillPose ? skillFrameStyle : getCombatFrameStyle(attackerKey, sourcePose);
        const sourceAnchor = getDuelWeaponAnchor(attackerKey, sourcePose, plan.weapon);
        const grip = projectDuelAnchor(sourceAnchor.grip, { width: attacker.offsetWidth, scale: Number(sourceStyle?.['--combat-sprite-scale']) || 1, footOffset: (parseFloat(sourceStyle?.['--combat-foot-offset']) || 0) / 100, body: sampleDuelTrack(plan.body, at) });
        return [attacker.offsetLeft + reach * x + grip[0], arena.clientHeight - parseFloat(getComputedStyle(attacker).bottom) - attacker.offsetWidth + grip[1] + attacker.offsetHeight * y / 100];
      };
      const point=([fraction,y],at)=>{
        const source = weaponPoint(at);
        return [source[0]+(d-source[0])*fraction,source[1]+(dy-source[1])*fraction+y*arena.clientHeight];
      };
      for(const [index,effect]of plan.effects.entries()){
        const element=root.querySelector(`[data-duel-effect="${index}"]`);
        const isTravel=Math.abs(effect.from[0]-effect.to[0])>.1;
        const isContact=plan.contacts.some(at=>Math.abs(effect.at-at)<=.06);
        if(miss&&isContact&&!isTravel){element.style.visibility='hidden';continue;}
        element.style.visibility='';
        const from=point(effect.from,effect.at),to=point(effect.to,effect.until);
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
  },[ref,plan,duration,enabled,shake,miss,support,finish,selfSupport,attackerKey]);
}
