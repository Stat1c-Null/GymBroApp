import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { Friendship, friendshipId, otherMember, splitFriendships } from './friends';

/**
 * The friend graph: `friendships/{pairId}`.
 *
 * One document per relationship, shared by both people, with a deterministic id
 * ({@link friendshipId}). That is the whole design in one sentence — it means
 * accepting or removing a friend is a single write that both sides see, with no
 * mirrored copy to keep in sync (contrast `SettingsService.commitGroupChange`,
 * which needs a `writeBatch` precisely because its state lives in two places).
 */
@Injectable({ providedIn: 'root' })
export class FriendService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /**
   * Every friendship the signed-in user is part of — pending and accepted, sent
   * and received — from a single live query. `undefined` means "still loading",
   * distinct from `[]` ("no friends yet").
   *
   * One `array-contains` filter and no `orderBy`, on purpose: that keeps it a
   * single-field query needing **no composite index**. Direction, status and
   * ordering are all derived client-side by {@link splitFriendships}.
   */
  readonly friendships = toSignal(
    toObservable(this.auth.currentUser).pipe(
      switchMap((user) =>
        user
          ? collectionData(
              query(
                this.friendshipsCollection(),
                where('members', 'array-contains', user.uid)
              ),
              { idField: 'id', serverTimestamps: 'estimate' }
            )
          : of(undefined)
      )
    ),
    { initialValue: undefined }
  ) as () => Friendship[] | undefined;

  private readonly buckets = computed(() => {
    const list = this.friendships();
    const uid = this.auth.currentUser()?.uid;
    return list && uid ? splitFriendships(list, uid) : undefined;
  });

  /** Accepted friendships, newest first. `undefined` while loading. */
  readonly friends = computed(() => this.buckets()?.friends);

  /** Requests waiting on this user to accept or decline. */
  readonly incomingRequests = computed(() => this.buckets()?.incoming);

  /** Requests this user sent that haven't been answered yet. */
  readonly outgoingRequests = computed(() => this.buckets()?.outgoing);

  /**
   * The user's relationships keyed by the *other* person's uid, so a search
   * result can be labelled ("Friends" / "Requested" / "Accept") without a
   * per-result query.
   */
  readonly byOtherUid = computed(() => {
    const uid = this.auth.currentUser()?.uid;
    const list = this.friendships();
    const map = new Map<string, Friendship>();
    if (!uid || !list) return map;
    for (const friendship of list) {
      map.set(otherMember(friendship, uid), friendship);
    }
    return map;
  });

  /**
   * Send a friend request. The deterministic id means this is idempotent for the
   * pair: a second request — in either direction — targets the same document
   * instead of creating a duplicate. Re-sending over an *existing* friendship is
   * also refused server-side, since the security rule only permits an update
   * that moves a pending request to accepted.
   */
  async sendRequest(targetUid: string): Promise<void> {
    const uid = this.auth.requireUid('add a friend');
    if (targetUid === uid) {
      throw new Error('You cannot add yourself as a friend.');
    }

    await setDoc(this.friendshipDoc(friendshipId(uid, targetUid)), {
      members: [uid, targetUid].sort(),
      requesterUid: uid,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  }

  /** Accept an incoming request. Only the recipient can — enforced in rules too. */
  async accept(id: string): Promise<void> {
    this.auth.requireUid('accept a friend request');
    await updateDoc(this.friendshipDoc(id), {
      status: 'accepted',
      respondedAt: serverTimestamp(),
    });
  }

  /** Turn down an incoming request. Deleting it leaves the pair free to try again. */
  async decline(id: string): Promise<void> {
    this.auth.requireUid('decline a friend request');
    await deleteDoc(this.friendshipDoc(id));
  }

  /** Withdraw a request this user sent. */
  async cancel(id: string): Promise<void> {
    this.auth.requireUid('cancel a friend request');
    await deleteDoc(this.friendshipDoc(id));
  }

  /** Unfriend. Removes the relationship for both people — there is only one doc. */
  async remove(id: string): Promise<void> {
    this.auth.requireUid('remove a friend');
    await deleteDoc(this.friendshipDoc(id));
  }

  private friendshipsCollection() {
    return collection(this.firestore, 'friendships');
  }

  private friendshipDoc(id: string) {
    return doc(this.firestore, 'friendships', id);
  }
}
