import { Component, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrl: './signup.css',
})
export class SignupComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Form fields
  protected displayName = '';
  protected email = '';
  protected password = '';
  protected confirmPassword = '';

  // UI state
  protected isLoading = signal(false);
  protected isGoogleLoading = signal(false);
  protected errorMessage = signal('');
  protected showPassword = signal(false);
  protected showConfirmPassword = signal(false);

  // Toast
  protected toastMessage = signal('');
  protected toastType = signal<'success' | 'error'>('success');
  protected toastVisible = signal(false);

  // Password strength
  protected passwordStrength = computed(() => {
    const pw = this.password;
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

  // We need this as a signal for the template to react to changes
  protected passwordValue = signal('');

  onPasswordChange(): void {
    this.passwordValue.set(this.password);
  }

  async onSignUp(): Promise<void> {
    // Validate
    if (
      !this.displayName ||
      !this.email ||
      !this.password ||
      !this.confirmPassword
    ) {
      this.errorMessage.set('Please fill in all fields.');
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage.set('Password must be at least 6 characters.');
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.signUp(
        this.email,
        this.password,
        this.displayName
      );
      this.showToast('Account created successfully!', 'success');
      this.router.navigate(['/dashboard']);
    } catch (error: unknown) {
      const authError = error as { message: string };
      this.errorMessage.set(authError.message);
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
      const authError = error as { message: string };
      if (authError.message !== 'Google sign-in was cancelled.') {
        this.errorMessage.set(authError.message);
      }
    } finally {
      this.isGoogleLoading.set(false);
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.toastVisible.set(true);
    setTimeout(() => this.toastVisible.set(false), 3500);
  }
}
