import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';
import { ModalComponent } from '../../components/modal/modal';
import {
  WeightService,
  WeightEntry,
  convertWeight,
} from '../../services/weight.service';

@Component({
  selector: 'app-weights',
  standalone: true,
  imports: [FormsModule, DatePipe, ModalComponent],
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
    if ((this.kg != null && this.kg <= 0) || (this.lbs != null && this.lbs <= 0)) {
      this.error.set('Enter a weight greater than zero.');
      return;
    }

    // Derive one unit from the other so the stored pair is always consistent.
    // If both are filled, kilograms wins (the first field) and pounds is
    // recomputed — the form only asks for one unit anyway.
    let kg: number;
    let lbs: number;
    if (this.kg != null) {
      kg = this.kg;
      lbs = convertWeight(this.kg, 'kg');
    } else {
      lbs = this.lbs as number;
      kg = convertWeight(this.lbs as number, 'lbs');
    }

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
