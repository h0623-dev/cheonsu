export function getSupportRank(points) {
  if (points >= 120) return "A";
  if (points >= 70) return "B";
  if (points >= 30) return "C";
  return "-";
}


export function getSupportNext(points) {
  if (points < 30) return 30 - points;
  if (points < 70) return 70 - points;
  if (points < 120) return 120 - points;
  return 0;
}


export function getUnitNameById(party, id) {
  return party.find((u) => u.id === id)?.name || id;
}

