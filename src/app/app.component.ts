import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { Router, RouterOutlet, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { MatProgressBar } from '@angular/material/progress-bar';
import { NavbarComponent } from './navbar/navbar.component';
import { MobilenavComponent } from './navbar/mobilenav.component';
import { BusyService } from './services/busy.service';

/** 画面の部品が読めずに読み直した URL（同じ URL で何度も読み直さないため） */
const RELOAD_KEY = 'MWSYS_RELOAD_URL';
/** スマホでも PC 用のメニューを使う（この端末に覚える） */
const PCMENU_KEY = 'MWSYS_PCMENU';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [RouterOutlet, NavbarComponent, MobilenavComponent, MatProgressBar]
})
export class AppComponent {
  title = 'mwsys';
  busy = inject(BusyService);
  private router = inject(Router);
  private endNav?: () => void;

  /** 画面の幅が狭い（スマホ）か */
  readonly narrow = signal(false);
  /** スマホでも PC 用のメニューを使う（この端末に覚える） */
  readonly pcMenu = signal(false);
  /** スマホ用のナビゲーションバーを出すか */
  readonly mobile = computed(() => this.narrow() && !this.pcMenu());

  /** スマホでも PC 用のメニューを使うか切り替える */
  setPcMenu(on: boolean) {
    this.pcMenu.set(on);
    try {
      if (on) {
        localStorage.setItem(PCMENU_KEY, '1');
      } else {
        localStorage.removeItem(PCMENU_KEY);
      }
    } catch {
      // 覚えられなくても切り替える
    }
  }

  constructor() {
    const mq = window.matchMedia('(max-width: 767px)');
    this.narrow.set(mq.matches);
    mq.addEventListener('change', e => this.narrow.set(e.matches));
    try {
      this.pcMenu.set(localStorage.getItem(PCMENU_KEY) != null);
    } catch {
      // 使えなければ覚えていない
    }
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
