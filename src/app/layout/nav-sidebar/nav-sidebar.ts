import { Component, inject, input, output } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ThemeToggleComponent } from '../../components/theme-toggle/theme-toggle';

@Component({
  selector: 'app-nav-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, ThemeToggleComponent],
  templateUrl: './nav-sidebar.html',
  styleUrl: './nav-sidebar.css',
})
export class NavSidebarComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly open = input(false);
  readonly close = output<void>();

  protected readonly displayName = this.authService.displayName;

  /** On mobile, following a link should close the full-screen overlay. */
  protected onNavigate(): void {
    if (window.innerWidth <= 768) {
      this.close.emit();
    }
  }

  protected async onSignOut(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
