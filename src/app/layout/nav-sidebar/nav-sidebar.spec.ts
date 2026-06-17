import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavSidebarComponent } from './nav-sidebar';
import { AuthService } from '../../services/auth.service';

/** Typed window onto NavSidebarComponent's `protected` members. */
interface NavSidebarView {
  onSignOut: () => Promise<void>;
}

describe('NavSidebarComponent', () => {
  let view: NavSidebarView;
  let authService: { logout: ReturnType<typeof vi.fn>; displayName: () => string };
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    authService = {
      logout: vi.fn().mockResolvedValue(undefined),
      displayName: () => 'Gym Bro',
    };

    await TestBed.configureTestingModule({
      imports: [NavSidebarComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        provideRouter([]),
      ],
    }).compileComponents();

    view = TestBed.createComponent(NavSidebarComponent)
      .componentInstance as unknown as NavSidebarView;
    navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
  });

  it('signs out and returns to the login page', async () => {
    await view.onSignOut();

    expect(authService.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
