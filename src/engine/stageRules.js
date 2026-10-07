function resolveStageId(stageOrId) {
  if (typeof stageOrId === "number" && Number.isFinite(stageOrId)) {
    return Math.max(1, Math.floor(stageOrId));
  }

  if (
    stageOrId &&
    typeof stageOrId === "object" &&
    typeof stageOrId.id === "number" &&
    Number.isFinite(stageOrId.id)
  ) {
    return Math.max(1, Math.floor(stageOrId.id));
  }

  return 1;
}

function resolveEnemyCount(stageOrId) {
  if (!stageOrId || typeof stageOrId !== "object") return 0;
  if (!Array.isArray(stageOrId.units)) return 0;
  return stageOrId.units.filter((unit) => unit?.type !== "ally").length;
}

function resolveMapSize(stageOrId) {
  if (!stageOrId || typeof stageOrId !== "object") return { width: 0, height: 0 };
  if (!Array.isArray(stageOrId.map) || !stageOrId.map.length) return { width: 0, height: 0 };

  return {
    width: stageOrId.map[0]?.length || 0,
    height: stageOrId.map.length,
  };
}

export function getStageRoundLimit(stageOrId) {
  const stageId = resolveStageId(stageOrId);
  let limit;

  if (stageId <= 3) {
    limit = 14;
  } else if (stageId <= 6) {
    limit = 16;
  } else if (stageId <= 12) {
    limit = 18;
  } else if (stageId <= 18) {
    limit = 20;
  } else if (stageId <= 24) {
    limit = 22;
  } else if (stageId <= 30) {
    limit = 24;
  } else {
    limit = 26;
  }

  const enemyCount = resolveEnemyCount(stageOrId);
  const mapSize = resolveMapSize(stageOrId);
  const mapMax = Math.max(mapSize.width, mapSize.height);

  if (enemyCount >= 12) limit += 1;
  if (enemyCount >= 16) limit += 1;
  if (enemyCount >= 20) limit += 1;
  if (mapMax >= 14) limit += 1;
  if (mapMax >= 16) limit += 1;

  // 기존 장별·전장 규모 보정과 상한을 확정한 뒤 한 번만 1.5배로 늘립니다.
  // 저장된 전장도 같은 계산을 사용하므로 진행 라운드나 저장 데이터는 바꾸지 않습니다.
  return Math.ceil(Math.min(30, limit) * 1.5);
}
