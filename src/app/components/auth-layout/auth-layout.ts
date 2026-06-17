import { Component, input } from '@angular/core';
import { BrandLogoComponent } from '../brand-logo/brand-logo';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [BrandLogoComponent],
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
  `,
  styleUrl: './auth-layout.css',
})
export class AuthLayoutComponent {
  readonly title = input('');
  readonly subtitle = input('');
}
