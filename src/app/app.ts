import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SettingsSidebarComponent } from './components/settings-sidebar/settings-sidebar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SettingsSidebarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
