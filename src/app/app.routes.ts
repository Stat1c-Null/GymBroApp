import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./pages/signup/signup').then((m) => m.SignupComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/shell/shell').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard').then(
            (m) => m.DashboardComponent
          ),
      },
      {
        path: 'weeks',
        loadComponent: () =>
          import('./pages/weeks/weeks').then((m) => m.WeeksComponent),
      },
      {
        path: 'workouts',
        loadComponent: () =>
          import('./pages/workouts/workouts').then((m) => m.WorkoutsComponent),
      },
      {
        path: 'weights',
        loadComponent: () =>
          import('./pages/weights/weights').then((m) => m.WeightsComponent),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./pages/analytics/analytics').then(
            (m) => m.AnalyticsComponent
          ),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings').then((m) => m.SettingsComponent),
      },
      {
        path: 'changelog',
        loadComponent: () =>
          import('./pages/changelog/changelog').then(
            (m) => m.ChangelogComponent
          ),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
