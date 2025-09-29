import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TrappistComponent } from './trappist.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TrappistComponent],
  template: `
    <app-trappist />
  `,
})
export class AppComponent {
  title = 'trappist';
}
