import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  // This component's only job is to render the active route.
  // The TrappistComponent will be rendered here by the router.
  template: `<router-outlet />`,
})
export class AppComponent {}

