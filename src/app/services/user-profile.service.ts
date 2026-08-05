import { Injectable, effect, inject } from '@angular/core';
import { User } from '@angular/fire/auth';
import {
  DocumentData,
  Firestore,
  QueryConstraint,
  QueryDocumentSnapshot,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { PREFIX_SENTINEL, UserProfile, parseSearchTerm } from './friends';

/** How many people to show at once, browsing or searching. */
export const PROFILE_PAGE_SIZE = 20;

/**
 * Where the next page starts. Opaque to callers — it's a Firestore document
 * snapshot, handed straight back to {@link UserProfileService.listProfiles}.
 *
 * Deliberately a snapshot rather than the last name string: Firestore appends
 * the document id as a tiebreaker to every sort, and a snapshot cursor carries
 * that tiebreaker with it. A bare name would silently skip people who share a
 * display name with the one sitting on a page boundary.
 */
export type ProfileCursor = QueryDocumentSnapshot<DocumentData>;

/** One page of directory results. */
export interface ProfilePage {
  profiles: UserProfile[];
  /** Cursor for the following page, or `null` when this is the last one. */
  next: ProfileCursor | null;
}

/**
 * The searchable user directory: `userProfiles/{uid}`.
 *
 * This is the app's **first collection outside `users/{uid}`** — everything else
 * is private per-user data. It exists because friend search has to read *other*
 * people's names, which the per-user tree structurally cannot allow.
 *
 * Only the minimum needed to find and label a person is copied here. Nothing
 * about their workouts, weight or settings leaves `users/{uid}`.
 */
@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /**
   * uid → profile, so rendering a friend list doesn't re-read the same handful
   * of documents on every change. Names change rarely; a stale label until the
   * next page load is an acceptable trade for not re-reading on every render.
   */
  private readonly cache = new Map<string, UserProfile>();

  constructor() {
    // Keep the directory entry in step with Firebase Auth. There is no other
    // trigger available: a client cannot enumerate Auth users, so an account
    // that never signs in again simply stays unsearchable — unlike the analytics
    // back-fill, no catch-up migration is possible.
    effect(() => {
      const user = this.auth.currentUser();
      if (user) void this.syncProfile(user);
    });
  }

  /**
   * One page of people to add as friends.
   *
   * - **Empty term** — everyone, alphabetically. Browsing matters because prefix
   *   search can't find someone whose spelling you don't know, and because it
   *   answers "does this person have a profile at all yet?".
   * - **Term containing `@`** — exact email match, unpaged: there can only be one
   *   hit. No `orderBy` on this path on purpose — pairing an equality filter with
   *   a sort on a *different* field would demand a composite index.
   * - **Anything else** — display-name prefix. Its range filter and its sort are
   *   on the same field, so this stays single-field too.
   *
   * Every path is therefore auto-indexed; none needs Firebase-console setup.
   *
   * One-shot rather than a live subscription: search is a request/response, and
   * results that mutated under the user mid-click would be worse, not better.
   */
  async listProfiles(
    term = '',
    after: ProfileCursor | null = null
  ): Promise<ProfilePage> {
    const parsed = parseSearchTerm(term);
    const profiles = collection(this.firestore, 'userProfiles');
    const constraints: QueryConstraint[] = [];

    if (parsed.kind === 'email' && parsed.value) {
      constraints.push(
        where('emailLower', '==', parsed.value),
        limit(PROFILE_PAGE_SIZE)
      );
    } else {
      if (parsed.value) {
        constraints.push(
          where('displayNameLower', '>=', parsed.value),
          where('displayNameLower', '<=', parsed.value + PREFIX_SENTINEL)
        );
      }
      constraints.push(orderBy('displayNameLower'));
      if (after) constraints.push(startAfter(after));
      // Ask for one row more than a page: whether that row comes back is what
      // tells us a next page exists, with no separate count query.
      constraints.push(limit(PROFILE_PAGE_SIZE + 1));
    }

    const snapshot = await getDocs(query(profiles, ...constraints));
    const hasMore = snapshot.docs.length > PROFILE_PAGE_SIZE;
    const docs = snapshot.docs.slice(0, PROFILE_PAGE_SIZE);

    return {
      profiles: docs.map((d) => this.remember(d.id, d.data())),
      next: hasMore ? docs[docs.length - 1] : null,
    };
  }

  /** One person's profile, from cache when possible. `null` if they have none. */
  async profileFor(uid: string): Promise<UserProfile | null> {
    const cached = this.cache.get(uid);
    if (cached) return cached;

    const snapshot = await getDoc(doc(this.firestore, 'userProfiles', uid));
    if (!snapshot.exists()) return null;
    return this.remember(snapshot.id, snapshot.data());
  }

  /**
   * Write the signed-in user's directory entry, but only when it would actually
   * change — signing in shouldn't cost a write on every page load.
   */
  private async syncProfile(user: User): Promise<void> {
    try {
      const displayName = profileNameFor(user);
      const emailLower = (user.email ?? '').toLowerCase();
      const ref = doc(this.firestore, 'userProfiles', user.uid);

      const snapshot = await getDoc(ref);
      const existing = snapshot.exists()
        ? this.remember(snapshot.id, snapshot.data())
        : null;
      if (
        existing &&
        existing.displayName === displayName &&
        existing.emailLower === emailLower
      ) {
        return;
      }

      const profile: UserProfile = {
        uid: user.uid,
        displayName,
        displayNameLower: displayName.toLowerCase(),
        emailLower,
        ...(existing ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, profile, { merge: true });
      this.cache.set(user.uid, profile);
    } catch (err) {
      // Nothing the user can act on mid-sign-in, and the only consequence is
      // that they aren't findable in search — so log it rather than interrupt.
      console.error('[friends] profile sync failed', err);
    }
  }

  /** Cache a document's data as a profile, with `uid` taken from the doc id. */
  private remember(uid: string, data: DocumentData): UserProfile {
    const profile = { ...(data as unknown as UserProfile), uid };
    this.cache.set(uid, profile);
    return profile;
  }
}

/**
 * The name to publish in the directory.
 *
 * Deliberately *not* `AuthService.displayName`, which falls back to the whole
 * email address: that fallback is fine for the "signed in as…" label a user sees
 * about themselves, but here it would print someone's email onto other people's
 * screens. Emails are matchable in search and never displayed, so the fallback
 * is the local part only.
 */
function profileNameFor(user: User): string {
  return user.displayName?.trim() || user.email?.split('@')[0] || 'Gym Bro';
}
