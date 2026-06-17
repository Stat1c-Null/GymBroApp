import { Component, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { BrandLogoComponent } from '../../components/brand-logo/brand-logo';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [BrandLogoComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent {
  protected readonly authService = inject(AuthService);
}
