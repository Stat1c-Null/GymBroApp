import { Component } from '@angular/core';
import { ChangelogEntryComponent } from '../../components/changelog-entry/changelog-entry';
import { CHANGELOG } from './changelog-data';

@Component({
  selector: 'app-changelog',
  standalone: true,
  imports: [ChangelogEntryComponent],
  templateUrl: './changelog.html',
  styleUrl: './changelog.css',
})
export class ChangelogComponent {
  protected readonly entries = CHANGELOG;
}
