import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.currentUser()) {
    return true;
  }

  // If still loading auth state, wait briefly then check again
  if (authService.isLoading()) {
    return new Promise<boolean>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!authService.isLoading()) {
          clearInterval(checkInterval);
          if (authService.currentUser()) {
            resolve(true);
          } else {
            router.navigate(['/login']);
            resolve(false);
          }
        }
      }, 50);

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!authService.currentUser()) {
          router.navigate(['/login']);
          resolve(false);
        }
      }, 5000);
    });
  }

  router.navigate(['/login']);
  return false;
};
