import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  User,
  Unsubscribe,
} from '@angular/fire/auth';

export interface AuthError {
  code: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly auth = inject(Auth);
  private readonly googleProvider = new GoogleAuthProvider();
  private readonly unsubscribe: Unsubscribe;

  readonly currentUser = signal<User | null>(null);

  /** Best available label for the signed-in user. */
  readonly displayName = computed(() => {
    const user = this.currentUser();
    return user?.displayName || user?.email || 'Gym Bro';
  });

  constructor() {
    this.unsubscribe = onAuthStateChanged(this.auth, (user) => {
      this.currentUser.set(user);
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe();
  }

  async signUp(
    email: string,
    password: string,
    displayName: string
  ): Promise<void> {
    try {
      const credential = await createUserWithEmailAndPassword(
        this.auth,
        email,
        password
      );
      await updateProfile(credential.user, { displayName });
      // updateProfile doesn't trigger onAuthStateChanged, so refresh manually.
      this.currentUser.set(this.auth.currentUser);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    try {
      await signInWithEmailAndPassword(this.auth, email, password);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async signInWithGoogle(): Promise<void> {
    try {
      await signInWithPopup(this.auth, this.googleProvider);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): AuthError {
    const firebaseError = error as { code?: string; message?: string };
    const code = firebaseError.code ?? 'unknown';

    const messages: Record<string, string> = {
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-credential': 'Invalid email or password. Please try again.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/too-many-requests':
        'Too many failed attempts. Please try again later.',
      'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
      'auth/network-request-failed':
        'Network error. Check your connection and try again.',
    };

    return {
      code,
      message: messages[code] ?? 'Something went wrong. Please try again.',
    };
  }
}
