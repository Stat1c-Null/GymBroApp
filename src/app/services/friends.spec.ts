import { describe, expect, it } from 'vitest';
import {
  Friendship,
  PREFIX_SENTINEL,
  friendshipId,
  otherMember,
  parseSearchTerm,
  splitFriendships,
} from './friends';

/** A Firestore-shaped timestamp, as `serverTimestamps: 'estimate'` hands one back. */
function at(iso: string) {
  return { toDate: () => new Date(iso) };
}

function friendship(partial: Partial<Friendship>): Friendship {
  return {
    members: ['a', 'b'],
    requesterUid: 'a',
    status: 'pending',
    createdAt: at('2026-01-01T00:00:00Z'),
    ...partial,
  };
}

describe('friendshipId', () => {
  it('is the two uids sorted and joined', () => {
    expect(friendshipId('abc', 'xyz')).toBe('abc_xyz');
  });

  it('is the same whichever order the pair is given in', () => {
    // This is what makes duplicate and crossing requests impossible.
    expect(friendshipId('xyz', 'abc')).toBe(friendshipId('abc', 'xyz'));
  });
});

describe('otherMember', () => {
  it('returns the member who is not the given uid', () => {
    expect(otherMember(friendship({ members: ['a', 'b'] }), 'a')).toBe('b');
    expect(otherMember(friendship({ members: ['a', 'b'] }), 'b')).toBe('a');
  });

  it('falls back to the given uid when there is no other member', () => {
    expect(otherMember(friendship({ members: ['a', 'a'] }), 'a')).toBe('a');
  });
});

describe('splitFriendships', () => {
  const accepted = friendship({ id: 'a_b', status: 'accepted' });
  const sentByA = friendship({ id: 'a_c', members: ['a', 'c'], requesterUid: 'a' });
  const sentToA = friendship({ id: 'a_d', members: ['a', 'd'], requesterUid: 'd' });

  it('buckets accepted, outgoing and incoming from the user angle', () => {
    const buckets = splitFriendships([accepted, sentByA, sentToA], 'a');

    expect(buckets.friends.map((f) => f.id)).toEqual(['a_b']);
    expect(buckets.outgoing.map((f) => f.id)).toEqual(['a_c']);
    expect(buckets.incoming.map((f) => f.id)).toEqual(['a_d']);
  });

  it('flips incoming and outgoing when read from the other side', () => {
    // The same pending doc is "outgoing" to its requester and "incoming" to the
    // recipient — there is only one document, so direction is derived, not stored.
    const buckets = splitFriendships([sentByA], 'c');

    expect(buckets.incoming.map((f) => f.id)).toEqual(['a_c']);
    expect(buckets.outgoing).toEqual([]);
  });

  it('sorts each bucket newest-first', () => {
    const older = friendship({
      id: 'old',
      members: ['a', 'x'],
      requesterUid: 'x',
      createdAt: at('2026-01-01T00:00:00Z'),
    });
    const newer = friendship({
      id: 'new',
      members: ['a', 'y'],
      requesterUid: 'y',
      createdAt: at('2026-06-01T00:00:00Z'),
    });

    const buckets = splitFriendships([older, newer], 'a');

    expect(buckets.incoming.map((f) => f.id)).toEqual(['new', 'old']);
  });

  it('sorts a still-pending server timestamp to the top', () => {
    const pending = friendship({
      id: 'pending',
      members: ['a', 'z'],
      requesterUid: 'z',
      createdAt: null,
    });
    const existing = friendship({
      id: 'existing',
      members: ['a', 'y'],
      requesterUid: 'y',
      createdAt: at('2026-06-01T00:00:00Z'),
    });

    const buckets = splitFriendships([existing, pending], 'a');

    expect(buckets.incoming.map((f) => f.id)).toEqual(['pending', 'existing']);
  });

  it('returns empty buckets for an empty list', () => {
    expect(splitFriendships([], 'a')).toEqual({
      friends: [],
      incoming: [],
      outgoing: [],
    });
  });
});

describe('parseSearchTerm', () => {
  it('classifies anything containing @ as an email', () => {
    expect(parseSearchTerm('Someone@Example.com ')).toEqual({
      kind: 'email',
      value: 'someone@example.com',
    });
  });

  it('classifies everything else as a name prefix', () => {
    expect(parseSearchTerm('  Mikita ')).toEqual({
      kind: 'name',
      value: 'mikita',
    });
  });

  it('normalizes an empty term to an empty value', () => {
    expect(parseSearchTerm('   ').value).toBe('');
  });
});

describe('PREFIX_SENTINEL', () => {
  it('is U+F8FF, so it brackets every string with the searched prefix', () => {
    expect(PREFIX_SENTINEL).toHaveLength(1);
    expect(PREFIX_SENTINEL.codePointAt(0)).toBe(0xf8ff);
    expect('mikita' < 'mik' + PREFIX_SENTINEL).toBe(true);
  });
});
