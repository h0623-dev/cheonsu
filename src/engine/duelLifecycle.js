// The animation owns the visible contact clock. Cancellation never applies a late hit.
// Injected timers make the once-only contract testable without a browser or React.
export function createDuelLifecycle({ duration, impact, onImpact, onComplete, schedule = setTimeout, cancel = clearTimeout }) {
  const length = Number.isFinite(duration) ? Math.max(1, duration) : 1800;
  const contact = Number.isFinite(impact) ? Math.max(0, Math.min(1, impact)) : .5;
  let active = true, impacted = false, completed = false;
  const hit = () => {
    if (!active || impacted) return;
    impacted = true;
    onImpact?.();
  };
  const finish = () => {
    if (!active || completed) return;
    hit();
    if (!active) return;
    completed = true;
    onComplete?.();
  };
  const contactTimer = schedule(hit, length * contact);
  const completeTimer = schedule(finish, length);
  return { hit, finish, cancel() { active = false; cancel(contactTimer); cancel(completeTimer); } };
}
