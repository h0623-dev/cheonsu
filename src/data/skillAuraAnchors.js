import authoredAnchors from './skillWeaponAnchors.json' with { type: 'json' };
import reviewedAnchors from './reviewedSkillWeaponAnchors.json' with { type: 'json' };
import { getCharacterArt } from './characterArt.js';
import { getExpansionArtIdentity } from './expansionArtRegistry.js';

const HERO_BLADE = {
  windup: { kind: 'blade', grip: [310, 186], tip: [149, 129] },
  strike: { kind: 'blade', grip: [336, 276], tip: [491, 276] },
  'skill-a': { kind: 'blade', grip: [329, 288], tip: [488, 288] },
  'skill-b': { kind: 'blade', grip: [329, 214], tip: [335, 72] },
};
const kinds = { slash: 'blade', thrust: 'spear', heavy: 'hammer', guard: 'shield', quick: 'dagger', beast: 'claw', whip: 'whip', fist: 'fist', bow: 'bow', cannon: 'cannon', cast: 'focus' };
const bound = value => Math.max(5, Math.min(507, value));
const frameBox = metrics => ({ top: metrics?.top ?? 64, bottom: metrics?.bottom ?? 479 });

export function getExpansionBaseKey(key) { return getExpansionArtIdentity(key)?.baseId || key; }

function inheritedAnchor(anchor, reference, target) {
  const from = frameBox(reference), to = frameBox(target);
  const ratio = Math.max(.3, Math.min(1.8, (to.bottom - to.top) / Math.max(1, from.bottom - from.top)));
  const map = point => [bound(256 + (point[0] - 256) * ratio), bound(to.top + (point[1] - from.top) * ratio)];
  const result = { kind: anchor.kind, grip: map(anchor.grip), tip: map(anchor.tip), ...(anchor.focus ? { focus: map(anchor.focus) } : {}), authored: false, origin: 'base-profile' };
  if (anchor.secondary) result.secondary = { grip: map(anchor.secondary.grip), tip: map(anchor.secondary.tip) };
  if (anchor.bookCenter) result.bookCenter = map(anchor.bookCenter);
  if (anchor.bow) {
    result.bow = { upper: map(anchor.bow.upper), lower: map(anchor.bow.lower), arrowVisible: anchor.bow.arrowVisible };
    result.bow.path = `M${result.bow.upper.join(' ')}Q${result.grip.join(' ')} ${result.bow.lower.join(' ')}`;
  }
  return result;
}

// New art has frame bounds but no independently measured hand/weapon landmarks yet.
// Keep the measured legacy landmarks; fit inherited or weapon profiles to each new frame.
export function getSkillAuraAnchor(key, pose = 'strike', weapon) {
  const identity = getExpansionArtIdentity(key), canonical = identity?.baseId || key;
  const explicit = authoredAnchors[key] || authoredAnchors[identity?.assetId];
  const direct = explicit?.[pose] || explicit?.strike || (key === 'hero' ? HERO_BLADE[pose] || HERO_BLADE.strike : null);
  if (direct) return { ...direct, authored: true, reviewed: false, origin: 'authored-frame' };
  const inspected = reviewedAnchors.units[key] || reviewedAnchors.units[identity?.assetId] || reviewedAnchors.units[canonical];
  const reviewed = identity?.key === canonical ? inspected?.[pose] : null;
  if (reviewed) return { ...reviewed, authored: false, reviewed: true, origin: 'reviewed-frame' };
  const source = (authoredAnchors[canonical] || reviewedAnchors.units[canonical] || (canonical === 'hero' ? HERO_BLADE : null));
  const base = source?.[pose] || source?.strike;
  const art = getCharacterArt(key), metrics = art?.metrics?.[pose] || art?.metrics?.strike;
  if (base && identity?.key !== canonical) return inheritedAnchor(base, getCharacterArt(canonical)?.metrics?.[pose], metrics);
  const motion = weapon || identity?.weapon || 'slash';
  const kind = canonical === 'bell_keeper' ? 'music' : canonical === 'sylvan' ? 'staff' : kinds[motion] || 'blade';
  const box = frameBox(metrics), span = Math.max(1, box.bottom - box.top);
  const at = (x, y) => [bound(256 + (x - .5) * Math.min(512, span * 1.15)), bound(box.top + span * y)];
  const prepared = pose === 'windup', elevated = pose === 'skill-b';
  let grip, tip;
  if (['fist', 'claw'].includes(kind)) { grip = at(prepared ? .55 : .73, .52); tip = at(prepared ? .62 : .81, .49); }
  else if (kind === 'bow') { grip = at(.65, .49); tip = at(prepared ? .67 : .96, prepared ? .12 : .47); }
  else if (kind === 'hammer') { grip = at(prepared ? .56 : .67, prepared ? .39 : .54); tip = at(prepared ? .28 : .85, prepared ? .12 : .68); }
  else if (['focus', 'staff', 'music'].includes(kind)) { grip = at(.59, .51); tip = at(.71, elevated ? .12 : .32); }
  else if (kind === 'shield') { grip = at(.63, .53); tip = at(.68, .30); }
  else if (kind === 'spear') { grip = at(prepared ? .55 : .63, .52); tip = at(prepared ? .86 : .99, elevated ? .10 : .43); }
  else { grip = at(prepared ? .58 : .70, elevated ? .38 : .53); tip = at(prepared ? .27 : elevated ? .71 : .97, prepared ? .17 : elevated ? .05 : .51); }
  const result = { kind, grip, tip, focus: ['bow','shield'].includes(kind) ? grip : tip, authored: false, origin: 'weapon-profile' };
  if (kind === 'bow') {
    result.bow = { upper: at(.68, .16), lower: at(.64, .84), arrowVisible: !prepared };
    result.bow.path = `M${result.bow.upper.join(' ')}Q${grip[0] + span * .08} ${grip[1]} ${result.bow.lower.join(' ')}`;
  }
  return result;
}
