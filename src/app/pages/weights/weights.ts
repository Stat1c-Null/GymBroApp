import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';
import {
  WeightService,
  WeightEntry,
  convertWeight,
} from '../../services/weight.service';

@Component({
  selector: 'app-weights',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './weights.html',
  styleUrl: './weights.css',
})
export class WeightsComponent {
  private readonly service = inject(WeightService);
  private readonly toast = inject(ToastService);

  protected readonly weights = this.service.weights;

  // Modal + form state
  protected readonly showModal = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected kg: number | null = null;
  protected lbs: number | null = null;

  protected openModal(): void {
    this.kg = null;
    this.lbs = null;
    this.error.set('');
    this.showModal.set(true);
  }

  protected closeModal(): void {
    this.showModal.set(false);
  }

  protected async onSubmit(): Promise<void> {
    if (this.kg == null && this.lbs == null) {
      this.error.set('Enter a weight in kilograms or pounds.');
      return;
    }

    // Fill in whichever field the user left blank from the other.
    const kg = this.kg ?? convertWeight(this.lbs as number, 'lbs');
    const lbs = this.lbs ?? convertWeight(this.kg as number, 'kg');

    this.saving.set(true);
    this.error.set('');
    try {
      await this.service.add({ kg, lbs });
      this.toast.show('Weight logged!', 'success');
      this.closeModal();
    } catch {
      this.error.set('Could not save your weight. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async onDelete(entry: WeightEntry): Promise<void> {
    if (!entry.id) return;
    if (!confirm(`Delete this entry (${entry.kg} kg)? This can't be undone.`)) {
      return;
    }
    try {
      await this.service.remove(entry.id);
      this.toast.show('Entry deleted', 'success');
    } catch {
      this.toast.show('Could not delete entry. Please try again.', 'error');
    }
  }

  /** Firestore Timestamp → Date, or null while a server timestamp is pending. */
  protected toDate(ts: unknown): Date | null {
    return ts && typeof (ts as { toDate?: unknown }).toDate === 'function'
      ? (ts as { toDate: () => Date }).toDate()
      : null;
  }
}
