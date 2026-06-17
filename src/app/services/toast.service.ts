import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal('');
  readonly type = signal<ToastType>('success');
  readonly visible = signal(false);

  private timer?: ReturnType<typeof setTimeout>;

  show(message: string, type: ToastType = 'success', duration = 3500): void {
    this.message.set(message);
    this.type.set(type);
    this.visible.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.visible.set(false), duration);
  }
}
