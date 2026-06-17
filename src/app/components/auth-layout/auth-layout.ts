import { Component, input } from '@angular/core';
import { BrandLogoComponent } from '../brand-logo/brand-logo';
import { SettingsSidebarComponent } from '../settings-sidebar/settings-sidebar';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [BrandLogoComponent, SettingsSidebarComponent],
  template: `
    <div class="auth-page">
      <div class="auth-bg">
        <div class="bg-orb bg-orb-1"></div>
        <div class="bg-orb bg-orb-2"></div>
        <div class="bg-orb bg-orb-3"></div>
      </div>

      <div class="auth-card glass-card">
        <div class="auth-header">
          <div class="auth-logo">
            <app-brand-logo [size]="40" />
          </div>
          <h1 class="auth-title">{{ title() }}</h1>
          <p class="auth-subtitle">{{ subtitle() }}</p>
        </div>

        <ng-content />
      </div>
    </div>

    <!-- Theme settings (auth pages only; app pages use the nav sidebar) -->
    <app-settings-sidebar />
  `,
  styleUrl: './auth-layout.css',
})
export class AuthLayoutComponent {
  readonly title = input('');
  readonly subtitle = input('');
}
