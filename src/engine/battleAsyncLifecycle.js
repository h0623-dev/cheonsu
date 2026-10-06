// One epoch spans a battle. Leaving it releases every pending task without a late commit.
export function createBattleAsyncLifecycle({ schedule = setTimeout, unschedule = clearTimeout } = {}) {
  let epoch = 0;
  const tasks = new Set();
  const current = token => token === epoch;
  const register = cancel => { tasks.add(cancel); return () => tasks.delete(cancel); };
  const cancelAll = () => {
    epoch++;
    const pending = [...tasks];
    tasks.clear();
    for (const cancel of pending) cancel();
  };
  const wait = (duration, token = epoch) => new Promise(resolve => {
    if (!current(token)) { resolve(false); return; }
    let settled = false, timer;
    const finish = value => {
      if (settled) return;
      settled = true;
      unschedule(timer);
      remove();
      resolve(value && current(token));
    };
    const remove = register(() => finish(false));
    timer = schedule(() => finish(true), Math.max(0, duration));
  });
  const paint = (token = epoch, request = requestAnimationFrame, cancelFrame = cancelAnimationFrame) => new Promise(resolve => {
    if (!current(token)) { resolve(false); return; }
    let frame, timer, settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      cancelFrame(frame);
      unschedule(timer);
      remove();
      resolve(value && current(token));
    };
    const remove = register(() => finish(false));
    frame = request(() => { if (!settled) frame = request(() => finish(true)); });
    timer = schedule(() => finish(true), 120);
  });
  return { capture: () => epoch, current, register, cancelAll, wait, paint, pendingCount: () => tasks.size };
}
