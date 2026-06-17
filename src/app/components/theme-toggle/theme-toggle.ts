import { Component, inject } from '@angular/core';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `
    <div class="setting-item">
      <div class="setting-label">
        <span class="setting-icon">
          @if (themeService.theme() === 'dark') {
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          } @else {
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          }
        </span>
        <span>{{ themeService.theme() === 'dark' ? 'Dark Mode' : 'Light Mode' }}</span>
      </div>
      <button
        class="theme-switch"
        [class.active]="themeService.theme() === 'light'"
        (click)="themeService.toggleTheme()"
        [attr.aria-label]="'Switch to ' + (themeService.theme() === 'dark' ? 'light' : 'dark') + ' mode'"
      >
        <span class="switch-knob"></span>
      </button>
    </div>
  `,
  styles: [`
    .setting-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: var(--bg-tertiary);
      border-radius: var(--radius-md);
      border: 1px solid var(--border-subtle);
      transition: border-color var(--transition-fast);
    }

    .setting-item:hover {
      border-color: var(--border-color);
    }

    .setting-label {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text-primary);
    }

    .setting-icon {
      color: var(--primary);
      display: flex;
      align-items: center;
    }

    .theme-switch {
      position: relative;
      width: 48px;
      height: 26px;
      border-radius: 13px;
      background: var(--bg-input);
      border: 1.5px solid var(--border-color);
      cursor: pointer;
      padding: 0;
      transition: all var(--transition-fast);
    }

    .theme-switch.active {
      background: var(--primary-gradient);
      border-color: var(--primary);
    }

    .switch-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--text-secondary);
      transition: all var(--transition-normal);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    }

    .theme-switch.active .switch-knob {
      left: calc(100% - 20px);
      background: white;
    }
  `],
})
export class ThemeToggleComponent {
  protected readonly themeService = inject(ThemeService);
}
