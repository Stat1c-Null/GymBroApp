import { TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignupComponent } from './signup';
import { AuthService } from '../../services/auth.service';

/** Typed window onto SignupComponent's `protected` template members. */
interface SignupView {
  displayName: string;
  email: string;
  password: WritableSignal<string>;
  confirmPassword: string;
  errorMessage: () => string;
  passwordStrength: () => { level: number; label: string };
  onSignUp: () => Promise<void>;
  onGoogleSignUp: () => Promise<void>;
}

describe('SignupComponent', () => {
  let view: SignupView;
  let authService: {
    signUp: ReturnType<typeof vi.fn>;
    signInWithGoogle: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.spyOn>;

  /** Fills every field with valid, matching values. */
  const fillValidForm = () => {
    view.displayName = 'Gym Bro';
    view.email = 'user@example.com';
    view.password.set('secret123');
    view.confirmPassword = 'secret123';
  };

  beforeEach(async () => {
    authService = {
      signUp: vi.fn().mockResolvedValue(undefined),
      signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [SignupComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        provideRouter([]),
      ],
    }).compileComponents();

    view = TestBed.createComponent(SignupComponent)
      .componentInstance as unknown as SignupView;
    navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
  });

  describe('validation', () => {
    it('requires every field', async () => {
      await view.onSignUp();

      expect(view.errorMessage()).toBe('Please fill in all fields.');
      expect(authService.signUp).not.toHaveBeenCalled();
    });

    it('rejects passwords shorter than 6 characters', async () => {
      fillValidForm();
      view.password.set('abc');
      view.confirmPassword = 'abc';

      await view.onSignUp();

      expect(view.errorMessage()).toBe('Password must be at least 6 characters.');
      expect(authService.signUp).not.toHaveBeenCalled();
    });

    it('rejects mismatched passwords', async () => {
      fillValidForm();
      view.confirmPassword = 'different';

      await view.onSignUp();

      expect(view.errorMessage()).toBe('Passwords do not match.');
      expect(authService.signUp).not.toHaveBeenCalled();
    });
  });

  describe('account creation', () => {
    it('creates the account and navigates to the dashboard', async () => {
      fillValidForm();

      await view.onSignUp();

      expect(authService.signUp).toHaveBeenCalledWith(
        'user@example.com',
        'secret123',
        'Gym Bro'
      );
      expect(navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('surfaces the mapped error when sign-up fails', async () => {
      authService.signUp.mockRejectedValue({
        code: 'auth/email-already-in-use',
        message: 'An account with this email already exists.',
      });
      fillValidForm();

      await view.onSignUp();

      expect(view.errorMessage()).toBe(
        'An account with this email already exists.'
      );
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('google sign up', () => {
    it('ignores a cancelled popup without showing an error', async () => {
      authService.signInWithGoogle.mockRejectedValue({
        code: 'auth/popup-closed-by-user',
        message: 'Google sign-in was cancelled.',
      });

      await view.onGoogleSignUp();

      expect(view.errorMessage()).toBe('');
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('password strength', () => {
    it('reports no strength for an empty password', () => {
      view.password.set('');
      expect(view.passwordStrength()).toEqual({ level: 0, label: '' });
    });

    it('rates a short simple password as weak', () => {
      view.password.set('abcdef');
      expect(view.passwordStrength().label).toBe('Weak');
    });

    it('rates a mixed password as medium', () => {
      view.password.set('Abcde1');
      expect(view.passwordStrength().label).toBe('Medium');
    });

    it('rates a long complex password as strong', () => {
      view.password.set('Abcdefghij1!');
      expect(view.passwordStrength().label).toBe('Strong');
    });
  });
});
