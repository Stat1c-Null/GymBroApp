import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, AuthError, BENIGN_POPUP_CODES } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout';
import { PasswordInputComponent } from '../../components/password-input/password-input';
import { GoogleButtonComponent } from '../../components/google-button/google-button';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    AuthLayoutComponent,
    PasswordInputComponent,
    GoogleButtonComponent,
  ],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  /** Where to go after a successful sign-in: the guarded deep link the user
   *  was sent here from, or the dashboard by default. */
  private returnUrl(): string {
    return this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
  }

  // Form fields
  protected email = '';
  protected password = '';

  // UI state
  protected isLoading = signal(false);
  protected isGoogleLoading = signal(false);
  protected errorMessage = signal('');

  // Password reset modal
  protected showResetModal = signal(false);
  protected resetEmail = '';
  protected resetLoading = signal(false);
  protected resetMessage = signal('');
  protected resetError = signal('');
  /** Handle for the success auto-close timer, so opening/closing the modal can
   *  cancel a pending close from a previous send. */
  private resetCloseTimer?: ReturnType<typeof setTimeout>;

  async onSignIn(): Promise<void> {
    if (!this.email || !this.password) {
      this.errorMessage.set('Please fill in all fields.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.signIn(this.email, this.password);
      this.router.navigateByUrl(this.returnUrl());
    } catch (error: unknown) {
      this.errorMessage.set((error as AuthError).message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onGoogleSignIn(): Promise<void> {
    this.isGoogleLoading.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.signInWithGoogle();
      this.router.navigateByUrl(this.returnUrl());
    } catch (error: unknown) {
      const authError = error as AuthError;
      // Closing or superseding the popup isn't a real failure — stay quiet.
      if (!BENIGN_POPUP_CODES.includes(authError.code)) {
        this.errorMessage.set(authError.message);
      }
    } finally {
      this.isGoogleLoading.set(false);
    }
  }

  openResetModal(): void {
    clearTimeout(this.resetCloseTimer);
    this.resetEmail = this.email; // Pre-fill with login email
    this.resetMessage.set('');
    this.resetError.set('');
    this.showResetModal.set(true);
  }

  closeResetModal(): void {
    clearTimeout(this.resetCloseTimer);
    this.showResetModal.set(false);
  }

  async onResetPassword(): Promise<void> {
    if (!this.resetEmail) {
      this.resetError.set('Please enter your email address.');
      return;
    }

    this.resetLoading.set(true);
    this.resetError.set('');
    this.resetMessage.set('');

    try {
      await this.authService.resetPassword(this.resetEmail);
      this.resetMessage.set('Password reset email sent! Check your inbox.');
      this.resetCloseTimer = setTimeout(() => this.closeResetModal(), 2500);
      this.toast.show('Password reset email sent!', 'success');
    } catch (error: unknown) {
      this.resetError.set((error as AuthError).message);
    } finally {
      this.resetLoading.set(false);
    }
  }
}
