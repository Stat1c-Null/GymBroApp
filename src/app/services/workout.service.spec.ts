import { describe, expect, it } from 'vitest';
import { CARDIO_GROUP, UNASSIGNED_GROUP, isOrphanGroup } from './workout.service';

describe('isOrphanGroup', () => {
  it('treats a group missing from the known list as an orphan', () => {
    const known = new Set(['Chest', 'Back']);
    expect(isOrphanGroup('Deleted Group', known)).toBe(true);
  });

  it('does not treat a known group as an orphan', () => {
    const known = new Set(['Chest', 'Back']);
    expect(isOrphanGroup('Chest', known)).toBe(false);
  });

  it('never treats the reserved Cardio category as an orphan, even though it is never in the known list', () => {
    const known = new Set(['Chest', 'Back']);
    expect(isOrphanGroup(CARDIO_GROUP, known)).toBe(false);
  });

  it('treats the reserved Unassigned sentinel itself as an orphan when it somehow ends up stored', () => {
    const known = new Set(['Chest', 'Back']);
    expect(isOrphanGroup(UNASSIGNED_GROUP, known)).toBe(true);
  });
});
