import { Component, inject, signal } from '@angular/core';
import { SettingsService } from '../../services/settings.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsComponent {
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);

  protected readonly showSetTime = this.settings.showSetTime;
  protected readonly saving = signal(false);

  protected async toggleSetTime(): Promise<void> {
    this.saving.set(true);
    try {
      await this.settings.setShowSetTime(!this.showSetTime());
    } catch {
      this.toast.show('Could not save your setting. Please try again.', 'error');
    } finally {
      this.saving.set(false);
    }
  }
}
