import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);

  // authState emits once Firebase has restored the persisted session,
  // so a single value tells us whether the user is signed in.
  const user = await firstValueFrom(authState(inject(Auth)));

  return user ? true : router.createUrlTree(['/login']);
};
