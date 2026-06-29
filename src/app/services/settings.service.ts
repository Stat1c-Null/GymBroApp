import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore';
import { of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { MUSCLE_GROUPS } from './workout.service';

/** Per-user app preferences. Extend here as more settings are added. */
export interface UserSettings {
  showSetTime: boolean;
  muscleGroups?: string[];
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

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
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw new Error('You must be signed in to change settings.');
    await setDoc(
      this.settingsDoc(uid),
      { showSetTime: value },
      { merge: true }
    );
  }

  async setMuscleGroups(groups: string[]): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw new Error('You must be signed in to change settings.');
    await setDoc(
      this.settingsDoc(uid),
      { muscleGroups: groups },
      { merge: true }
    );
  }

  private settingsDoc(uid: string) {
    return doc(this.firestore, 'users', uid, 'settings', 'preferences');
  }
}
