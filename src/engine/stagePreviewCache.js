// Previews are read-only. Starting a battle must still build fresh mutable units.
export function createStagePreviewReader(build) {
  const stages = new WeakMap();
  return (stage, deployCount) => {
    if (!stage) return stage;
    let counts = stages.get(stage);
    if (!counts) { counts = new Map(); stages.set(stage, counts); }
    if (!counts.has(deployCount)) counts.set(deployCount, build(stage, deployCount));
    return counts.get(deployCount);
  };
}
