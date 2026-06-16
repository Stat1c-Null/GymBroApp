import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  get userName(): string {
    const user = this.authService.currentUser();
    return user?.displayName || user?.email || 'Gym Bro';
  }

  async onSignOut(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
