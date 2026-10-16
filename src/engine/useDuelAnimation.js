import { useLayoutEffect } from 'react';
import { getImpactParticle, getDuelDefenderReaction, getDuelPoseAt, sampleDuelTrack } from '../data/duelPerformance.js';
import { getDuelWeaponAnchor, getDuelReach, projectDuelAnchor } from '../data/duelContactGeometry.js';
import { getCombatFrameStyle } from '../data/combatArt.js';
import { animateSkillSpectacle } from './animateSkillSpectacle.js';
import { animateEpicCombat } from './animateEpicCombat.js';
import { fitCinematicDuel, getCinematicReach, resetCinematicDuelLayout } from './fitCinematicDuel.js';

const clamp=value=>Math.max(0,Math.min(1,value));

const cinematicTracks = points => [...new Map(points
  .filter(point => point.every(Number.isFinite))
  .map(([at, ...values]) => [clamp(at).toFixed(5), [clamp(at), ...values]]))
  .values()].sort((left, right) => left[0] - right[0]);

// Add weight around the authored beats; release/contact poses and their exact coordinates stay anchored.
function getCinematicActing(plan, { support, boss }) {
  const profiles = {
    slash: [3.6, .018, .013, 2.2], thrust: [2.8, .014, .01, 1.8],
    heavy: [5.1, .028, .017, 3.1], guard: [2.5, .018, .009, 1.5],
    quick: [2.4, .015, .015, 1.9], beast: [3.2, .023, .014, 2.1],
    whip: [3.4, .017, .012, 2.4], fist: [3.8, .022, .012, 2.3],
    bow: [2.5, .012, .01, 1.7], cannon: [2.1, .019, .018, 3.1],
    cast: [1.6, .01, .004, 1.1],
  };
  const [bend, compression, retreat, follow] = profiles[plan.weapon] || profiles.slash;
  const weight = support ? .42 : boss ? .58 : 1;
  const actor = plan.actor.map(point => [...point]), body = plan.body.map(point => [...point]);
  const sampleActor = at => sampleDuelTrack(plan.actor, clamp(at));
  const sampleBody = at => sampleDuelTrack(plan.body, clamp(at));
  const releases = plan.releases || [plan.impact];
  for (const [index, release] of releases.entries()) {
    const previous = index ? releases[index - 1] : .08;
    const preparation = Math.max(previous + .025, release - (plan.weapon === 'heavy' ? .115 : .085));
    const loaded = Math.max(preparation + .008, release - .025);
    if (loaded >= release - .003) continue;
    const [x, y] = sampleActor(loaded), [angle, sx, sy] = sampleBody(loaded);
    actor.push([loaded, x - retreat * weight, y + (support ? -.35 : .65) * weight]);
    body.push([preparation, ...sampleBody(preparation)],
      [loaded, angle - bend * weight, sx * (1 + compression * .35 * weight), sy * (1 - compression * weight)]);
    if (!plan.moving) {
      const nextRelease = releases[index + 1] ?? .94;
      const recoilAt = Math.min(nextRelease - .008, release + .019);
      const recoverAt = Math.min(nextRelease - .004, release + .083);
      if (recoilAt > release && recoverAt >= recoilAt) {
        const [rx, ry] = sampleActor(recoilAt), [ra, rsx, rsy] = sampleBody(recoilAt);
        actor.push([recoilAt, rx - retreat * weight * .8, ry + (support ? -.5 : .25) * weight], [recoverAt, ...sampleActor(recoverAt)]);
        body.push([recoilAt, ra - follow * weight, rsx, rsy * (1 - compression * .35 * weight)], [recoverAt, ...sampleBody(recoverAt)]);
      }
    }
  }
  if (plan.moving && !support) {
    for (const [index, contact] of plan.contacts.entries()) {
      const hold = contact + (plan.contactPause || 0);
      const nextRelease = releases[index + 1] ?? .94;
      const followAt = Math.min(nextRelease - .012, hold + .027);
      const recoverAt = Math.min(nextRelease - .004, hold + .085);
      if (followAt > hold && recoverAt >= followAt) {
        const [x, y] = sampleActor(followAt), [angle, sx, sy] = sampleBody(followAt);
        actor.push([followAt, x - retreat * weight * .6, y + .35 * weight], [recoverAt, ...sampleActor(recoverAt)]);
        body.push([followAt, angle + follow * weight, sx * (1 + compression * .15 * weight), sy * (1 - compression * .35 * weight)], [recoverAt, ...sampleBody(recoverAt)]);
      }
    }
  }
  // Restore every authored release/contact and contact hold after adding the surrounding acting.
  for (const at of [...releases, ...plan.contacts.flatMap(at => [at, at + (plan.contactPause || 0)])]) {
    actor.push([at, ...sampleActor(at)]);
    body.push([at, ...sampleBody(at)]);
  }
  actor.push([0, ...sampleActor(0)], [1, ...sampleActor(1)]);
  body.push([0, ...sampleBody(0)], [1, ...sampleBody(1)]);
  return { actor: cinematicTracks(actor), body: cinematicTracks(body) };
}

export function useDuelAnimation(ref,plan,duration,{enabled,shake,miss,support,finish,selfSupport,attackerKey,defenderKey}){
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
      resetCinematicDuelLayout(attacker,defender);
      root.classList.toggle('duel-motion-disabled',!enabled||media.matches);
      if(!enabled||media.matches)return;
      const attackerBoss = root.dataset.epicBossSide === 'attacker', defenderBoss = root.dataset.epicBossSide === 'defender';
      const acting = getCinematicActing(plan, { support, boss: attackerBoss });
      const theme = plan.spectacle?.theme || root.dataset.epicTheme;
      const contactFilter = theme === 'fire' ? 'brightness(1.19) sepia(.23) saturate(1.32)'
        : ['heal','holy','guard'].includes(theme) ? 'brightness(1.14) sepia(.08) saturate(1.06)'
          : theme === 'shadow' ? 'brightness(1.12) saturate(1.2)' : 'brightness(1.2) saturate(1.14)';
      const strikePose = plan.contactPose === 'strike' ? 'strike' : plan.skillPose?.src?.includes('skill-b') ? 'skill-b' : plan.skillPose ? 'skill-a' : 'strike';
      const skillFrameStyle = plan.skillPose ? { '--combat-sprite-scale': plan.skillPose.scale, '--combat-foot-offset': plan.skillPose.footOffset } : null;
      const frameStyle = plan.contactPose === 'strike' ? getCombatFrameStyle(attackerKey, 'strike') : skillFrameStyle || getCombatFrameStyle(attackerKey, strikePose);
      const anchor = getDuelWeaponAnchor(attackerKey, strikePose, plan.weapon);
      const scale = Number(frameStyle?.['--combat-sprite-scale']) || 1;
      const footOffset = (parseFloat(frameStyle?.['--combat-foot-offset']) || 0) / 100;
      const contactBody = sampleDuelTrack(acting.body, plan.impact);
      const target=selfSupport?attacker:defender||attacker;
      let ground=arena.clientHeight-parseFloat(getComputedStyle(target).bottom);
      let dy=ground-target.offsetWidth*.37;
      let contactFraction=.37;
      if (plan.moving && !support && !miss) {
        const tip = projectDuelAnchor(anchor.tip, { width: attacker.offsetWidth, scale, footOffset, body: contactBody });
        const attackerGround = arena.clientHeight - parseFloat(getComputedStyle(attacker).bottom);
        const authoredY = sampleDuelTrack(acting.actor, plan.impact)[1];
        const tipY = attackerGround - attacker.offsetWidth + tip[1] + attacker.offsetHeight * authoredY / 100;
        // A small fighter strikes the giant's lower torso; a giant aims at the small fighter's upper body.
        dy = Math.max(ground - target.offsetWidth * .78, Math.min(ground - target.offsetWidth * .18, tipY));
        contactFraction = (ground - dy) / Math.max(1,target.offsetWidth);
        const correction = Math.max(-7, Math.min(5, (dy - tipY) / Math.max(1, attacker.offsetHeight) * 100));
        const liftStart = Math.max(.1, (plan.releases[0] ?? plan.impact) - .055);
        const firstContact = plan.contacts[0] ?? plan.impact;
        const lastContact = plan.contacts.at(-1) ?? plan.impact;
        const holdUntil = lastContact + (plan.contactPause || 0);
        const recoverAt = Math.min(.965, holdUntil + .085);
        const liftAt = at => {
          if (at <= liftStart || at >= recoverAt) return 0;
          const fraction = at < firstContact ? clamp((at - liftStart) / Math.max(.001, firstContact - liftStart))
            : at <= holdUntil ? 1 : clamp((recoverAt - at) / Math.max(.001, recoverAt - holdUntil));
          return correction * fraction * fraction * (3 - 2 * fraction);
        };
        const offsets = [...new Set([...acting.actor.map(([at]) => at), liftStart, plan.impact, ...plan.contacts, holdUntil, recoverAt])];
        const originalActor = acting.actor;
        acting.actor = cinematicTracks(offsets.map(at => {
          const [x, y] = sampleDuelTrack(originalActor, clamp(at));
          return [at, x, y + liftAt(at)];
        }));
      }
      const layout=fitCinematicDuel({arena,attacker,defender:selfSupport?null:defender,attackerKey,
        defenderKey:defenderKey||defender?.dataset.unitKey,plan,acting,
        contact:{tip:anchor.tip,scale,footOffset,body:contactBody},contactFraction,miss,support,finish,defenderBoss});
      if(Number.isFinite(layout.contactFraction))contactFraction=layout.contactFraction;
      const reachOptions=defender&&plan.moving?{attackerLeft:attacker.offsetLeft,attackerWidth:attacker.offsetWidth,
        defenderLeft:defender.offsetLeft,defenderWidth:defender.offsetWidth,tip:anchor.tip,scale,footOffset,
        body:contactBody,advance:sampleDuelTrack(acting.actor,plan.impact)[0]}:null;
      const reach=reachOptions?(layout.fitted?getCinematicReach(reachOptions):getDuelReach(reachOptions))
        :Math.max(0,defender?defender.offsetLeft-attacker.offsetLeft-attacker.offsetWidth*.51:0);
      root.style.setProperty('--combat-reach', `${reach}px`);
      const a=attacker.offsetLeft+attacker.offsetWidth*.55,d=target.offsetLeft+target.offsetWidth*.46;
      ground=arena.clientHeight-parseFloat(getComputedStyle(target).bottom);
      dy=ground-target.offsetWidth*contactFraction;
      const animate=(element,frames,options={})=>{
        if(!element)return;
        const ordered=frames.filter(frame=>Number.isFinite(frame.offset)).map((frame,index)=>[clamp(frame.offset),index,frame])
          .sort((left,right)=>left[0]-right[0]||left[1]-right[1]).map(([offset,,frame])=>({...frame,offset}));
        const animation=element.animate(ordered,{duration,fill:'both',easing:'linear',...options});
        animation.currentTime=elapsed;if(paused)animation.pause();animations.push(animation);
      };
      animate(attacker,acting.actor.map(([offset,x,y])=>({offset,transform:`translateX(calc(var(--combat-reach) * ${x})) translateY(${y}%)`,easing:plan.releases.some(at=>at>offset+.001&&at-offset<=.04)?'cubic-bezier(.55,.02,.88,.4)':'cubic-bezier(.3,.65,.4,1)'})));
      animate(attacker.querySelector('.fighter-body'),acting.body.map(([offset,angle,sx,sy])=>({offset,transform:`rotate(${angle}deg) scale(${sx},${sy})`,easing:'cubic-bezier(.22,.65,.35,1)'})));
      animate(attacker.querySelector('.fighter-shadow'),acting.actor.map(([offset,,height])=>({offset,opacity:height < -3 ? .45 : .85,transform:`scale(${height < -3 ? .76 : 1.04},${height < -3 ? .7 : 1})`})));
      const litBeats = ['bow','cannon','cast'].includes(plan.weapon) || support ? plan.releases : plan.contacts;
      animate(attacker.querySelector('.fighter-poses'), [{ offset: 0, filter: 'brightness(1)' }, ...litBeats.flatMap(at => [
        { offset: at - .025, filter: 'brightness(1)' },
        { offset: at, filter: support ? 'brightness(1.08) saturate(1.08)' : contactFilter },
        { offset: at + .035, filter: support ? 'brightness(1.08) saturate(1.08)' : contactFilter },
        { offset: at + .075, filter: 'brightness(1)' },
      ]), { offset: 1, filter: 'brightness(1)' }]);
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
        const resistance = defenderBoss ? .34 : 1;
        animate(defender,reaction.actor.map(([offset,x,y]) => ({ offset, transform: `translate(${x*resistance}%,${y*resistance}%)` })));
        if (!finish) animate(defender.querySelector('.fighter-body'), reaction.body.map(([offset,angle,sx,sy]) => ({ offset, transform: `rotate(${angle*resistance}deg) scale(${1+(sx-1)*resistance},${1+(sy-1)*resistance})` })));
        if(!support&&!miss){
          animate(defender.querySelector('.fighter-poses'),[{offset:0,filter:'brightness(1)'},...plan.contacts.flatMap(at=>[
            {offset:at-.001,filter:'brightness(1)'},{offset:at,filter:contactFilter},
            {offset:at+plan.contactPause,filter:contactFilter},{offset:at+plan.contactPause+.025,filter:'brightness(1)'}]),{offset:1,filter:'brightness(1)'}]);
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
        if(finish&&!support&&!miss)animate(defender.querySelector('.fighter-body'),[{offset:0,transform:'none',opacity:1},{offset:impact-.001,transform:'none',opacity:1},{offset:impact,transform:`rotate(${defenderBoss?2:6}deg) scale(.99,.98)`,opacity:1},{offset:impact+plan.contactPause,transform:`rotate(${defenderBoss?2:6}deg) scale(.99,.98)`,opacity:1},{offset:.84,transform:`translateY(${defenderBoss?3:6}%) rotate(${defenderBoss?4:12}deg)`,opacity:1},{offset:1,transform:`translateY(${defenderBoss?6:10}%) rotate(${defenderBoss?7:18}deg)`,opacity:0}]);
      }
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
        const segment=acting.actor.findIndex(([t])=>t>=at),before=acting.actor[Math.max(0,segment-1)],after=acting.actor[Math.max(0,segment)];
        const t=after[0]===before[0]?0:(at-before[0])/(after[0]-before[0]);
        const x=before[1]+(after[1]-before[1])*t;
        dust.style.left=`${a+x*parseFloat(root.style.getPropertyValue('--combat-reach'))}px`;
        dust.style.top=`${arena.clientHeight-parseFloat(getComputedStyle(attacker).bottom)}px`;
        animate(dust,[{offset:0,opacity:0,transform:'scale(.35)'},{offset:at,opacity:0,transform:'scale(.35)'},{offset:at+.004,opacity:.4,transform:'scale(.35)'},
          {offset:Math.min(.99,at+.085),opacity:0,transform:'translateY(-7px) scale(1.5)'},{offset:1,opacity:0}]);
      }
      const weaponPoint = at => {
        const [x, y] = sampleDuelTrack(acting.actor, at);
        const activePose = getDuelPoseAt(plan, at);
        const sourcePose = activePose === 'skill' ? plan.skillPose?.src?.includes('skill-b') ? 'skill-b' : 'skill-a' : activePose === 'ready' ? 'recover' : activePose;
        const sourceStyle = activePose === 'skill' && plan.skillPose ? skillFrameStyle : getCombatFrameStyle(attackerKey, sourcePose);
        const sourceAnchor = getDuelWeaponAnchor(attackerKey, sourcePose, plan.weapon);
        const grip = projectDuelAnchor(sourceAnchor.grip, { width: attacker.offsetWidth, scale: Number(sourceStyle?.['--combat-sprite-scale']) || 1, footOffset: (parseFloat(sourceStyle?.['--combat-foot-offset']) || 0) / 100, body: sampleDuelTrack(acting.body, at) });
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
      animateSkillSpectacle(root,plan,{arena,attacker,a,d,dy,ground,miss,actorTrack:acting.actor},animate);
      animateEpicCombat(root,plan,{arena,attacker,defender,d,dy,ground,weaponPoint,miss,support,selfSupport,shake,finish},animate);
      if(shake&&!support&&!miss)animate(arena,[{offset:0,transform:'none'},...plan.contacts.flatMap(at=>[{offset:at-.003,transform:'none'},{offset:at+.008,transform:`translateX(-${plan.skill?2:1}px)`},{offset:at+.019,transform:`translateX(${plan.skill?2:1}px)`},{offset:at+.033,transform:'none'}]),{offset:1,transform:'none'}]);
    };
    start();
    const observer=new ResizeObserver(start);observer.observe(arena);
    media.addEventListener('change',start);
    return()=>{active=false;stop();resetCinematicDuelLayout(attacker,defender);observer.disconnect();media.removeEventListener('change',start);};
  },[ref,plan,duration,enabled,shake,miss,support,finish,selfSupport,attackerKey,defenderKey]);
}
