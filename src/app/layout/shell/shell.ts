import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavSidebarComponent } from '../nav-sidebar/nav-sidebar';
import { UserProfileService } from '../../services/user-profile.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, NavSidebarComponent],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class ShellComponent {
  /**
   * Injected purely for its side effect: the service keeps this user's
   * `userProfiles/{uid}` directory entry in step with Firebase Auth, so they stay
   * findable in friend search. The shell is the right host because it wraps every
   * signed-in route — nothing outside it (login/signup) has a user to publish.
   */
  private readonly profiles = inject(UserProfileService);

  // Desktop starts with the sidebar open; mobile starts collapsed.
  protected readonly open = signal(this.isDesktop());

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected close(): void {
    this.open.set(false);
  }

  private isDesktop(): boolean {
    return typeof window !== 'undefined' && window.innerWidth > 768;
  }
}
