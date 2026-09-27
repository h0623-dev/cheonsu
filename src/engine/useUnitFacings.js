import { useRef, useState } from 'react';
import { directionTo, getUnitFacing, withSavedFacings } from './unitFacing.js';

export function useUnitFacings() {
  const [facings, setFacings] = useState({});
  const current = useRef({});
  const resetFacings = (units = [], fresh = false) => {
    current.current = Object.fromEntries(units.map(unit => [unit.id, getUnitFacing(fresh ? { ...unit, facing: undefined } : unit, units)]));
    setFacings(current.current);
  };
  const faceUnit = (unit, target, direction) => {
    if (!unit) return;
    const facing = direction || directionTo(unit, target, getUnitFacing(unit, [], current.current));
    if (current.current[unit.id] === facing) return;
    current.current = { ...current.current, [unit.id]: facing };
    setFacings(current.current);
  };
  const faceCombat = ({ attacker, defender }) => {
    if (!attacker || !defender || attacker.id === defender.id) return;
    faceUnit(attacker, defender);
    faceUnit(defender, attacker);
  };
  return { facings, faceUnit, faceCombat, resetFacings, saveFacings: units => withSavedFacings(units, current.current) };
}
