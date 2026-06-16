import { Component, inject, signal, HostListener } from '@angular/core';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-settings-sidebar',
  standalone: true,
  templateUrl: './settings-sidebar.html',
  styleUrl: './settings-sidebar.css',
})
export class SettingsSidebarComponent {
  protected readonly themeService = inject(ThemeService);
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
