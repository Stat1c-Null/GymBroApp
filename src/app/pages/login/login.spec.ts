import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginComponent } from './login';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

/**
 * Typed window onto LoginComponent's template-facing members, which are
 * `protected`. Casting through this keeps the tests type-checked without
 * widening the component's real API.
 */
interface LoginView {
  email: string;
  password: string;
  resetEmail: string;
  errorMessage: () => string;
  resetError: () => string;
  resetMessage: () => string;
  onSignIn: () => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  onResetPassword: () => Promise<void>;
}

describe('LoginComponent', () => {
  let view: LoginView;
  let authService: {
    signIn: ReturnType<typeof vi.fn>;
    signInWithGoogle: ReturnType<typeof vi.fn>;
    resetPassword: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.spyOn>;
  let toast: { show: ReturnType<typeof vi.fn> };
  let queryParams: Record<string, string>;

  beforeEach(async () => {
    authService = {
      signIn: vi.fn().mockResolvedValue(undefined),
      signInWithGoogle: vi.fn().mockResolvedValue(undefined),
      resetPassword: vi.fn().mockResolvedValue(undefined),
    };
    toast = { show: vi.fn() };
    queryParams = {};

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        provideRouter([]),
        { provide: ToastService, useValue: toast },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParamMap() {
                return convertToParamMap(queryParams);
              },
            },
          },
        },
      ],
    }).compileComponents();

    view = TestBed.createComponent(LoginComponent)
      .componentInstance as unknown as LoginView;
    navigate = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);
  });

  describe('sign in', () => {
    it('blocks submission and shows an error when fields are empty', async () => {
      await view.onSignIn();

      expect(view.errorMessage()).toBe('Please fill in all fields.');
      expect(authService.signIn).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('signs in and navigates to the dashboard on success', async () => {
      view.email = 'user@example.com';
      view.password = 'secret123';

      await view.onSignIn();

      expect(authService.signIn).toHaveBeenCalledWith(
        'user@example.com',
        'secret123'
      );
      expect(navigate).toHaveBeenCalledWith('/dashboard');
      expect(view.errorMessage()).toBe('');
    });

    it('returns to the guarded deep link after signing in', async () => {
      queryParams = { returnUrl: '/weeks' };
      view.email = 'user@example.com';
      view.password = 'secret123';

      await view.onSignIn();

      expect(navigate).toHaveBeenCalledWith('/weeks');
    });

    it('surfaces the mapped error and stays on the page when sign-in fails', async () => {
      authService.signIn.mockRejectedValue({
        code: 'auth/wrong-password',
        message: 'Incorrect password. Please try again.',
      });
      view.email = 'user@example.com';
      view.password = 'wrong';

      await view.onSignIn();

      expect(view.errorMessage()).toBe('Incorrect password. Please try again.');
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('google sign in', () => {
    it('navigates to the dashboard on success', async () => {
      await view.onGoogleSignIn();

      expect(authService.signInWithGoogle).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith('/dashboard');
    });

    it('ignores a cancelled popup without showing an error', async () => {
      authService.signInWithGoogle.mockRejectedValue({
        code: 'auth/popup-closed-by-user',
        message: 'Google sign-in was cancelled.',
      });

      await view.onGoogleSignIn();

      expect(view.errorMessage()).toBe('');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('surfaces other google errors', async () => {
      authService.signInWithGoogle.mockRejectedValue({
        code: 'auth/network-request-failed',
        message: 'Network error. Check your connection and try again.',
      });

      await view.onGoogleSignIn();

      expect(view.errorMessage()).toBe(
        'Network error. Check your connection and try again.'
      );
    });
  });

  describe('password reset', () => {
    it('requires an email address', async () => {
      view.resetEmail = '';

      await view.onResetPassword();

      expect(view.resetError()).toBe('Please enter your email address.');
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('sends the reset email and shows a toast on success', async () => {
      view.resetEmail = 'user@example.com';

      await view.onResetPassword();

      expect(authService.resetPassword).toHaveBeenCalledWith(
        'user@example.com'
      );
      expect(view.resetMessage()).toContain('Password reset email sent');
      expect(toast.show).toHaveBeenCalledWith(
        'Password reset email sent!',
        'success'
      );
    });
  });
});
