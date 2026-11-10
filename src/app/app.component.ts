import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router, RouterOutlet, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { MatProgressBar } from '@angular/material/progress-bar';
import { NavbarComponent } from './navbar/navbar.component';
import { BusyService } from './services/busy.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [RouterOutlet, NavbarComponent, MatProgressBar]
})
export class AppComponent {
  title = 'mwsys';
  busy = inject(BusyService);
  private router = inject(Router);
  private endNav?: () => void;

  constructor() {
    // メニューで画面を選んだあと、画面の部品を読み込むあいだ「処理中」を出す
    this.router.events.subscribe(e => {
      if (e instanceof NavigationStart) {
        this.endNav?.();
        this.endNav = this.busy.begin('画面を開いています…');
      } else if (e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError) {
        this.endNav?.();
        this.endNav = undefined;
      }
    });
  }
}
