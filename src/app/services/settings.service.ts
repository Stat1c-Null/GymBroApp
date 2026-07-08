import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Firestore, doc, docData, setDoc, writeBatch } from '@angular/fire/firestore';
import { of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { MUSCLE_GROUPS, UNASSIGNED_GROUP, WorkoutService } from './workout.service';

/** Per-user app preferences. Extend here as more settings are added. */
export interface UserSettings {
  showSetTime: boolean;
  muscleGroups?: string[];
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly workouts = inject(WorkoutService);

  /**
   * The signed-in user's preferences, kept live via Firestore. `undefined` means
   * "still loading" or "no settings doc yet" — both safely fall back to defaults
   * below. Re-subscribes when the signed-in user changes.
   */
  private readonly settings = toSignal(
    toObservable(this.auth.currentUser).pipe(
      switchMap((user) =>
        user ? docData(this.settingsDoc(user.uid)) : of(undefined)
      )
    ),
    { initialValue: undefined }
  ) as () => Partial<UserSettings> | undefined;

  /** Show a time (m:ss) field next to each set when logging on the Weeks page. */
  readonly showSetTime = computed(() => this.settings()?.showSetTime ?? false);

  readonly muscleGroups = computed(
    () => this.settings()?.muscleGroups ?? MUSCLE_GROUPS
  );

  async setShowSetTime(value: boolean): Promise<void> {
    const uid = this.auth.requireUid('change settings');
    await setDoc(
      this.settingsDoc(uid),
      { showSetTime: value },
      { merge: true }
    );
  }

  async setMuscleGroups(groups: string[]): Promise<void> {
    const uid = this.auth.requireUid('change settings');
    await setDoc(
      this.settingsDoc(uid),
      { muscleGroups: groups },
      { merge: true }
    );
  }

  /**
   * Rename a muscle group: move every workout in `from` to `to` and update the
   * group list, in a single atomic batch so the workout library and the group
   * list can never disagree if the write is interrupted. Returns how many
   * workouts were moved.
   */
  async renameGroup(from: string, to: string): Promise<number> {
    const uid = this.auth.requireUid('change settings');
    const current = this.muscleGroups();
    const next = current.map((g) => (g === from ? to : g));
    return this.commitGroupChange(uid, from, to, next);
  }

  /**
   * Delete a muscle group: reassign its workouts to {@link UNASSIGNED_GROUP}
   * and drop it from the group list, atomically. Returns how many workouts
   * were reassigned.
   */
  async deleteGroup(group: string): Promise<number> {
    const uid = this.auth.requireUid('change settings');
    const next = this.muscleGroups().filter((g) => g !== group);
    return this.commitGroupChange(uid, group, UNASSIGNED_GROUP, next);
  }

  private async commitGroupChange(
    uid: string,
    from: string,
    to: string,
    nextGroups: string[]
  ): Promise<number> {
    const batch = writeBatch(this.firestore);
    const affected = await this.workouts.stageGroupReassign(batch, from, to);
    batch.set(this.settingsDoc(uid), { muscleGroups: nextGroups }, { merge: true });
    await batch.commit();
    return affected;
  }

  private settingsDoc(uid: string) {
    return doc(this.firestore, 'users', uid, 'settings', 'preferences');
  }
}
