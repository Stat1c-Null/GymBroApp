import { Component, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    <div
      class="toast"
      [class.visible]="toast.visible()"
      [class.success]="toast.type() === 'success'"
      [class.error]="toast.type() === 'error'"
    >
      {{ toast.message() }}
    </div>
  `,
})
export class ToastComponent {
  protected readonly toast = inject(ToastService);
}
