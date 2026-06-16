import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Form fields
  protected email = '';
  protected password = '';

  // UI state
  protected isLoading = signal(false);
  protected isGoogleLoading = signal(false);
  protected errorMessage = signal('');
  protected showPassword = signal(false);

  // Password reset modal
  protected showResetModal = signal(false);
  protected resetEmail = '';
  protected resetLoading = signal(false);
  protected resetMessage = signal('');
  protected resetError = signal('');

  // Toast
  protected toastMessage = signal('');
  protected toastType = signal<'success' | 'error'>('success');
  protected toastVisible = signal(false);

  async onSignIn(): Promise<void> {
    if (!this.email || !this.password) {
      this.errorMessage.set('Please fill in all fields.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.signIn(this.email, this.password);
      this.router.navigate(['/dashboard']);
    } catch (error: unknown) {
      const authError = error as { message: string };
      this.errorMessage.set(authError.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onGoogleSignIn(): Promise<void> {
    this.isGoogleLoading.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.signInWithGoogle();
      this.router.navigate(['/dashboard']);
    } catch (error: unknown) {
      const authError = error as { message: string };
      if (authError.message !== 'Google sign-in was cancelled.') {
        this.errorMessage.set(authError.message);
      }
    } finally {
      this.isGoogleLoading.set(false);
    }
  }

  openResetModal(): void {
    this.resetEmail = this.email; // Pre-fill with login email
    this.resetMessage.set('');
    this.resetError.set('');
    this.showResetModal.set(true);
  }

  closeResetModal(): void {
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
      this.resetMessage.set(
        'Password reset email sent! Check your inbox.'
      );
      setTimeout(() => this.closeResetModal(), 2500);
      this.showToast('Password reset email sent!', 'success');
    } catch (error: unknown) {
      const authError = error as { message: string };
      this.resetError.set(authError.message);
    } finally {
      this.resetLoading.set(false);
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.toastVisible.set(true);
    setTimeout(() => this.toastVisible.set(false), 3500);
  }
}
