import { Component, input } from '@angular/core';

let uid = 0;

@Component({
  selector: 'app-brand-logo',
  standalone: true,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 48 48" fill="none">
      <rect x="4" y="18" width="40" height="12" rx="3" [attr.fill]="fill" opacity="0.9" />
      <rect x="10" y="12" width="6" height="24" rx="3" [attr.fill]="fill" />
      <rect x="32" y="12" width="6" height="24" rx="3" [attr.fill]="fill" />
      <rect x="1" y="16" width="6" height="16" rx="3" [attr.fill]="fill" opacity="0.7" />
      <rect x="41" y="16" width="6" height="16" rx="3" [attr.fill]="fill" opacity="0.7" />
      <defs>
        <linearGradient [attr.id]="gradId" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:hsl(270, 80%, 55%)" />
          <stop offset="100%" style="stop-color:hsl(290, 70%, 50%)" />
        </linearGradient>
      </defs>
    </svg>
  `,
})
export class BrandLogoComponent {
  readonly size = input(40);
  protected readonly gradId = `brand-grad-${uid++}`;
  protected readonly fill = `url(#${this.gradId})`;
}
