import { Component, signal, HostListener } from '@angular/core';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-settings-sidebar',
  standalone: true,
  imports: [ThemeToggleComponent],
  templateUrl: './settings-sidebar.html',
  styleUrl: './settings-sidebar.css',
})
export class SettingsSidebarComponent {
  protected readonly isOpen = signal(false);

  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  close(): void {
    this.isOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) {
      this.close();
    }
  }
}
