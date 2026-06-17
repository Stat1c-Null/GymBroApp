import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavSidebarComponent } from '../nav-sidebar/nav-sidebar';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, NavSidebarComponent],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class ShellComponent {
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
