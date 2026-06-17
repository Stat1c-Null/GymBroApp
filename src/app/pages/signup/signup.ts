import { Component, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, AuthError } from '../../services/auth.service';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout';
import { PasswordInputComponent } from '../../components/password-input/password-input';
import { GoogleButtonComponent } from '../../components/google-button/google-button';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    AuthLayoutComponent,
    PasswordInputComponent,
    GoogleButtonComponent,
  ],
  templateUrl: './signup.html',
  styleUrl: './signup.css',
})
export class SignupComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Form fields
  protected displayName = '';
  protected email = '';
  protected password = signal('');
  protected confirmPassword = '';

  // UI state
  protected isLoading = signal(false);
  protected isGoogleLoading = signal(false);
  protected errorMessage = signal('');

  // Password strength — derived reactively from the password signal
  protected passwordStrength = computed(() => {
    const pw = this.password();
    if (!pw) return { level: 0, label: '' };

    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    if (score <= 1) return { level: 1, label: 'Weak' };
    if (score <= 3) return { level: 2, label: 'Medium' };
    return { level: 3, label: 'Strong' };
  });

  async onSignUp(): Promise<void> {
    // Validate
    if (
      !this.displayName ||
      !this.email ||
      !this.password() ||
      !this.confirmPassword
    ) {
      this.errorMessage.set('Please fill in all fields.');
      return;
    }

    if (this.password().length < 6) {
      this.errorMessage.set('Password must be at least 6 characters.');
      return;
    }

    if (this.password() !== this.confirmPassword) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.signUp(
        this.email,
        this.password(),
        this.displayName
      );
      this.router.navigate(['/dashboard']);
    } catch (error: unknown) {
      this.errorMessage.set((error as AuthError).message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onGoogleSignUp(): Promise<void> {
    this.isGoogleLoading.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.signInWithGoogle();
      this.router.navigate(['/dashboard']);
    } catch (error: unknown) {
      const authError = error as AuthError;
      if (authError.code !== 'auth/popup-closed-by-user') {
        this.errorMessage.set(authError.message);
      }
    } finally {
      this.isGoogleLoading.set(false);
    }
  }
}
