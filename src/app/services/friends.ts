/**
 * Friend-graph maths and shapes. No Angular, no Firestore — same spirit as
 * `cardio.ts` and `analytics/`: the logic worth testing lives in plain functions
 * that can be unit-tested without a TestBed.
 */
import { toDate } from './firestore-utils';

/** A friendship is either awaiting the recipient's answer, or mutual. */
export type FriendshipStatus = 'pending' | 'accepted';

/**
 * One relationship between two users, stored as a single shared document in the
 * top-level `friendships` collection — see {@link friendshipId} for why there is
 * one doc rather than a mirrored copy under each user.
 */
export interface Friendship {
  /** The document id, which is always {@link friendshipId} of the two members. */
  id?: string;
  /** Both uids, sorted. Sorted so the array-contains query key is stable. */
  members: string[];
  /** Who sent the request. Only the *other* member is allowed to accept it. */
  requesterUid: string;
  status: FriendshipStatus;
  createdAt?: unknown; // Firestore serverTimestamp
  respondedAt?: unknown; // Firestore serverTimestamp
}

/**
 * The searchable directory entry for a user (`userProfiles/{uid}`).
 *
 * `emailLower` exists purely so someone who knows the exact address can find its
 * owner — it is **never rendered**. Search results and the friend list show
 * `displayName` only.
 */
export interface UserProfile {
  uid: string;
  displayName: string;
  displayNameLower: string;
  emailLower: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/**
 * The high private-use codepoint (U+F8FF) Firestore prefix searches use as an
 * upper bound: `displayNameLower >= 'mik'` combined with
 * `displayNameLower <= 'mik' + PREFIX_SENTINEL` brackets every string starting
 * with "mik", because no realistic name sorts above it.
 *
 * Firestore has no full-text search, so prefix matching is the whole name-search
 * story — "kita" will not find "Mikita".
 *
 * Built with `String.fromCharCode` rather than written as a literal: the raw
 * character is invisible and does not survive every editor, copy-paste or diff
 * tool intact, and a silently mangled sentinel would break every name search.
 */
export const PREFIX_SENTINEL = String.fromCharCode(0xf8ff);

/**
 * The document id for the friendship between two users: both uids sorted and
 * joined.
 *
 * Deterministic on purpose. Because A→B and B→A resolve to the *same* document,
 * duplicate requests and the A-requests-B-while-B-requests-A race are impossible
 * by construction — no "does one already exist?" pre-query is needed.
 */
export function friendshipId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

/**
 * The member of `friendship` who isn't `uid` — i.e. the other person. Falls back
 * to `uid` if the pair somehow doesn't contain anyone else, so callers never get
 * `undefined`.
 */
export function otherMember(friendship: Friendship, uid: string): string {
  return friendship.members.find((member) => member !== uid) ?? uid;
}

/** The three buckets a user's friendships fall into, from that user's angle. */
export interface FriendshipBuckets {
  /** Accepted both ways — the friend list. */
  friends: Friendship[];
  /** Pending, sent by someone else: this user can accept or decline. */
  incoming: Friendship[];
  /** Pending, sent by this user: they can only cancel. */
  outgoing: Friendship[];
}

/**
 * Split one flat query result into the three views the Friends page renders.
 * A single `array-contains` query returns every friendship a user is part of
 * regardless of status or direction, which keeps Firestore down to one live
 * subscription and zero composite indexes; the bucketing happens here.
 *
 * Each bucket is sorted newest-first.
 */
export function splitFriendships(
  list: Friendship[],
  uid: string
): FriendshipBuckets {
  const buckets: FriendshipBuckets = { friends: [], incoming: [], outgoing: [] };

  for (const friendship of list) {
    if (friendship.status === 'accepted') {
      buckets.friends.push(friendship);
    } else if (friendship.requesterUid === uid) {
      buckets.outgoing.push(friendship);
    } else {
      buckets.incoming.push(friendship);
    }
  }

  buckets.friends.sort(byNewest);
  buckets.incoming.sort(byNewest);
  buckets.outgoing.sort(byNewest);
  return buckets;
}

/**
 * A search term, normalized and classified. Anything containing `@` is treated
 * as an email and matched exactly; everything else is a display-name prefix.
 */
export interface SearchTerm {
  kind: 'email' | 'name';
  value: string;
}

/** Normalize (trim + lowercase) and classify what the user typed. */
export function parseSearchTerm(raw: string): SearchTerm {
  const value = raw.trim().toLowerCase();
  return { kind: value.includes('@') ? 'email' : 'name', value };
}

/**
 * Newest-first. A pending `serverTimestamp` sorts to the top rather than the
 * bottom — it can only ever be the write that just happened.
 */
function byNewest(a: Friendship, b: Friendship): number {
  return timeOf(b) - timeOf(a);
}

function timeOf(friendship: Friendship): number {
  return toDate(friendship.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}
