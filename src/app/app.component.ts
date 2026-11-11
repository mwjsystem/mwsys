import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router, RouterOutlet, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { MatProgressBar } from '@angular/material/progress-bar';
import { NavbarComponent } from './navbar/navbar.component';
import { BusyService } from './services/busy.service';

/** 画面の部品が読めずに読み直した URL（同じ URL で何度も読み直さないため） */
const RELOAD_KEY = 'MWSYS_RELOAD_URL';

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
        if (e instanceof NavigationError) {
          this.reloadIfStale(e);
        } else if (e instanceof NavigationEnd) {
          try {
            sessionStorage.removeItem(RELOAD_KEY);
          } catch {
            // 使えなくてもよい
          }
        }
      }
    });
  }

  /**
   * 新しい版を公開したあと、古い画面（index.html）が残っている端末（iPhone の Safari など）では、
   * 画面の部品（古い名前の JS）が見つからず画面を開けない。そのときは 1 回だけページを読み直して、新しい版にする
   */
  private reloadIfStale(e: NavigationError) {
    const msg = String((e.error as Error)?.message ?? e.error ?? '');
    const stale = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .* failed|is not a valid JavaScript MIME type/i.test(msg);
    if (!stale) {
      return;
    }
    try {
      if (sessionStorage.getItem(RELOAD_KEY) == e.url) {
        // 読み直しても開けないときは、繰り返さない
        console.log('error navigation (stale chunk, reloaded once)', e);
        return;
      }
      sessionStorage.setItem(RELOAD_KEY, e.url);
    } catch {
      // sessionStorage が使えなくても読み直す
    }
    window.location.assign(e.url);
  }
}
