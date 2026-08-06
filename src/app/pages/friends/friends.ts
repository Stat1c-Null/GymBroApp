import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { FriendService } from '../../services/friend.service';
import {
  PROFILE_PAGE_SIZE,
  ProfileCursor,
  UserProfileService,
} from '../../services/user-profile.service';
import { Friendship, UserProfile, otherMember } from '../../services/friends';
import { ToastService } from '../../services/toast.service';
import { FriendWeekComponent } from './friend-week/friend-week';

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [FormsModule, FriendWeekComponent],
  templateUrl: './friends.html',
  styleUrl: './friends.css',
})
export class FriendsComponent {
  private readonly friendService = inject(FriendService);
  private readonly profiles = inject(UserProfileService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly friends = this.friendService.friends;
  protected readonly incoming = this.friendService.incomingRequests;
  protected readonly outgoing = this.friendService.outgoingRequests;
  protected readonly relationships = this.friendService.byOtherUid;

  protected readonly pageSize = PROFILE_PAGE_SIZE;

  // Directory state. `results` is null until a listing has actually been run,
  // which is what tells "nobody found" apart from "you haven't looked yet".
  protected term = '';
  private readonly results = signal<UserProfile[] | null>(null);
  protected readonly searching = signal(false);
  protected readonly searchError = signal('');

  /** The term the current listing was run with — paging must not follow edits
   *  the user makes to the box afterwards. */
  protected readonly activeTerm = signal('');

  protected readonly pageIndex = signal(0);

  /**
   * Where each page starts: `cursors[i]` is the cursor to pass for page `i`, so
   * `cursors[0]` is always null. Filled in as the user moves forward, which is
   * what lets Previous jump straight back without re-walking from the start.
   */
  private cursors: (ProfileCursor | null)[] = [null];
  private readonly nextCursor = signal<ProfileCursor | null>(null);

  protected readonly hasNextPage = computed(() => this.nextCursor() !== null);
  protected readonly hasPrevPage = computed(() => this.pageIndex() > 0);

  /** Id of the row with an action in flight, so only that row's buttons disable. */
  protected readonly busy = signal<string | null>(null);

  /**
   * The friend whose week is expanded below their row, or null.
   *
   * One at a time on purpose: each open panel is a live Firestore subscription,
   * and a list of them would keep several running while the user reads one.
   */
  protected readonly expandedUid = signal<string | null>(null);

  /** uid → display name, filled in as friendships arrive. */
  private readonly names = signal(new Map<string, string>());

  /** Everyone this user has a relationship with, whatever its status. */
  private readonly counterparts = computed(() => {
    const uid = this.auth.currentUser()?.uid;
    const list = this.friendService.friendships();
    return uid && list ? list.map((f) => otherMember(f, uid)) : [];
  });

  constructor() {
    // Friendship docs hold uids, not names — resolve them as the list changes.
    effect(() => void this.resolveNames(this.counterparts()));
  }

  /** The current page minus the user themselves, or null if nothing has run. */
  protected readonly visibleResults = computed(() => {
    const list = this.results();
    if (!list) return null;
    const uid = this.auth.currentUser()?.uid;
    return list.filter((profile) => profile.uid !== uid);
  });

  protected nameFor(uid: string): string {
    return this.names().get(uid) ?? '…';
  }

  protected initialFor(uid: string): string {
    return this.nameFor(uid).charAt(0).toUpperCase();
  }

  protected counterpartOf(friendship: Friendship): string {
    return otherMember(friendship, this.auth.currentUser()?.uid ?? '');
  }

  /** The existing relationship with a listed person, if any — drives their button. */
  protected relationshipWith(uid: string): Friendship | undefined {
    return this.relationships().get(uid);
  }

  /** Open this friend's week below their row, or close it if it's already open.
   *  Opening one closes any other — see {@link expandedUid}. */
  protected toggleWeek(uid: string): void {
    this.expandedUid.update((current) => (current === uid ? null : uid));
  }

  /**
   * Run a fresh listing from page one. An empty box is not a no-op: it browses
   * every registered user, which is the only way to find someone whose name you
   * can't spell — and the quickest way to see whether they're registered at all.
   */
  protected onSearch(): void {
    this.cursors = [null];
    this.nextCursor.set(null);
    void this.load(0, this.term);
  }

  protected nextPage(): void {
    if (this.hasNextPage()) void this.load(this.pageIndex() + 1, this.activeTerm());
  }

  protected prevPage(): void {
    if (this.hasPrevPage()) void this.load(this.pageIndex() - 1, this.activeTerm());
  }

  protected clearSearch(): void {
    this.term = '';
    this.results.set(null);
    this.searchError.set('');
    this.activeTerm.set('');
    this.cursors = [null];
    this.nextCursor.set(null);
    this.pageIndex.set(0);
  }

  private async load(index: number, term: string): Promise<void> {
    this.searching.set(true);
    this.searchError.set('');
    try {
      const page = await this.profiles.listProfiles(term, this.cursors[index] ?? null);
      this.results.set(page.profiles);
      this.nextCursor.set(page.next);
      this.pageIndex.set(index);
      this.activeTerm.set(term);
      // Remember where the following page begins so Next can jump straight there.
      if (page.next) this.cursors[index + 1] = page.next;
    } catch {
      this.results.set(null);
      this.searchError.set('Could not load that right now. Please try again.');
    } finally {
      this.searching.set(false);
    }
  }

  protected onAdd(profile: UserProfile): void {
    void this.run(profile.uid, 'Request sent!', () =>
      this.friendService.sendRequest(profile.uid)
    );
  }

  protected onAccept(friendship: Friendship): void {
    void this.run(friendship.id, 'Friend added!', () =>
      this.friendService.accept(friendship.id as string)
    );
  }

  protected onDecline(friendship: Friendship): void {
    void this.run(friendship.id, 'Request declined', () =>
      this.friendService.decline(friendship.id as string)
    );
  }

  protected onCancel(friendship: Friendship): void {
    void this.run(friendship.id, 'Request cancelled', () =>
      this.friendService.cancel(friendship.id as string)
    );
  }

  protected onRemove(friendship: Friendship): void {
    const name = this.nameFor(this.counterpartOf(friendship));
    if (!confirm(`Remove ${name} from your friends?`)) return;

    // Collapse their week too, so re-adding them later doesn't reopen it.
    this.expandedUid.set(null);
    void this.run(friendship.id, 'Friend removed', () =>
      this.friendService.remove(friendship.id as string)
    );
  }

  /**
   * Run one row action: mark the row busy, toast the outcome either way, and
   * always clear the busy flag. Every action on this page is the same shape.
   */
  private async run(
    id: string | undefined,
    success: string,
    action: () => Promise<void>
  ): Promise<void> {
    if (!id) return;
    this.busy.set(id);
    try {
      await action();
      this.toast.show(success, 'success');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Something went wrong. Please try again.';
      this.toast.show(message, 'error');
    } finally {
      this.busy.set(null);
    }
  }

  private async resolveNames(uids: string[]): Promise<void> {
    // Read the current names untracked: this runs inside an effect, and tracking
    // the very signal it writes to would make the effect re-run itself.
    const known = untracked(() => this.names());
    const missing = uids.filter((uid) => !known.has(uid));
    if (missing.length === 0) return;

    const resolved = await Promise.all(
      missing.map(
        async (uid) =>
          [uid, (await this.profiles.profileFor(uid))?.displayName ?? 'Unknown user'] as const
      )
    );

    this.names.update((current) => {
      const next = new Map(current);
      for (const [uid, name] of resolved) next.set(uid, name);
      return next;
    });
  }
}
