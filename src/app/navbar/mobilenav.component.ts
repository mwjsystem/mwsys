import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, output } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { UserService } from './../services/user.service';

/** スマホのメニューに出す画面 */
interface MobileLink { path: string; name: string; icon: string; note: string }

/** 倉庫のスマホで使う画面 */
export const MOBILE_LINKS: MobileLink[] = [
  { path: '/frmtana/scan', name: '棚卸', icon: 'inventory', note: '商品を読んで棚卸の数を入れる' },
  { path: '/frmship/pick', name: 'ピッキング', icon: 'shopping_basket', note: '出荷指示書の QR → 商品を読む' },
  { path: '/frmship/keep', name: 'キープ確認', icon: 'inventory_2', note: 'キープ表の QR → 確保した数' },
  { path: '/frmmove/check', name: '移動伝票の確認', icon: 'swap_horiz', note: '移動伝票・大会リストの QR → 数量を確認' },
  { path: '/frmtenkai/check', name: '展開完了', icon: 'task_alt', note: '展開指示書の QR → 展開完了' }
];

/**
 * スマホ用のナビゲーションバー（画面の幅が狭いとき、PC 用のメニューの代わりに出す）。
 * 上のバーに今の画面の名前と接続先（テスト環境）を出し、左のボタンで倉庫のスマホで使う画面のメニューを開く。
 * メニューから PC 用のメニューに切り替えられる（この端末に覚える）
 */
@Component({
  selector: 'app-mobilenav',
  template: `
    <header class="mbar" [class.test]="isTest">
      <button type="button" class="mbtn" (click)="open = !open" aria-label="メニュー"><mat-icon>{{open ? 'close' : 'menu'}}</mat-icon></button>
      <span class="mtitle">{{title}}</span>
      @if (isTest) {<span class="mtest">テスト環境</span>}
    </header>
    @if (open) {
      <div class="mback" (click)="open = false"></div>
      <nav class="mmenu">
        @for (l of links; track l.path) {
          <a class="mitem" [routerLink]="l.path" routerLinkActive="active" (click)="open = false">
            <mat-icon>{{l.icon}}</mat-icon>
            <span class="mname">{{l.name}}<small>{{l.note}}</small></span>
          </a>
        }
        <div class="msep"></div>
        <div class="minfo">
          {{usrsrv.userInfo['name'] ?? ''}}<br>
          接続先：{{isTest ? 'テスト環境' : '本番環境'}}
        </div>
        <button type="button" class="mitem sub" (click)="setDB(!isTest)">
          <mat-icon>sync_alt</mat-icon><span class="mname">{{isTest ? '本番環境' : 'テスト環境'}}に切り替える</span>
        </button>
        <button type="button" class="mitem sub" (click)="usePc.emit(); open = false">
          <mat-icon>desktop_windows</mat-icon><span class="mname">PC 用のメニューにする</span>
        </button>
        <button type="button" class="mitem sub" (click)="usrsrv.logout()">
          <mat-icon>exit_to_app</mat-icon><span class="mname">ログアウト</span>
        </button>
      </nav>
    }
  `,
  styles: [`
    :host { display: block; position: sticky; top: 0; z-index: 1000; }
    .mbar { display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 8px; background: #3f51b5; color: #ffffff; }
    .mbar.test { background: #c62828; }
    .mbtn { background: none; border: none; color: inherit; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; }
    .mtitle { flex: 1; font-size: 17px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mtest { font-size: 12px; background: #ffffff; color: #c62828; border-radius: 4px; padding: 2px 6px; font-weight: bold; }
    .mback { position: fixed; inset: 48px 0 0 0; background: rgba(0, 0, 0, 0.35); }
    .mmenu { position: fixed; top: 48px; left: 0; bottom: 0; width: min(320px, 86vw); background: #ffffff; overflow-y: auto; box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3); padding: 4px 0; }
    .mitem { display: flex; align-items: center; gap: 14px; width: 100%; padding: 12px 16px; color: #212121; text-decoration: none; background: none; border: none; font-size: 17px; text-align: left; }
    .mitem.active { background: #e8eaf6; color: #283593; font-weight: bold; }
    .mitem.sub { font-size: 15px; color: #424242; padding: 10px 16px; }
    .mname { display: flex; flex-direction: column; }
    .mname small { font-size: 12px; color: #757575; font-weight: normal; }
    .msep { border-top: 1px solid #e0e0e0; margin: 6px 0; }
    .minfo { font-size: 13px; color: #616161; padding: 6px 16px; }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterLink, RouterLinkActive, MatIcon]
})
export class MobilenavComponent {
  usrsrv = inject(UserService);
  private router = inject(Router);
  private cdRef = inject(ChangeDetectorRef);

  /** PC 用のメニューに切り替える */
  readonly usePc = output<void>();

  readonly links = MOBILE_LINKS;
  readonly isTest = localStorage.getItem('MWSYS_DB') != null;
  open = false;
  title = 'MWSystem';

  constructor() {
    this.setTitle(this.router.url);
    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) {
        this.setTitle(e.urlAfterRedirects);
        // スマホでトップページを開いたときは、メニューを開いておく（倉庫で使う画面を選びやすく）
        this.open = e.urlAfterRedirects.split('?')[0] == '/';
        this.cdRef.markForCheck();
      }
    });
  }

  private setTitle(url: string) {
    const path = url.split('?')[0];
    const l = this.links.find(e => path == e.path || path.startsWith(e.path + '/'));
    // スマホ用でない画面は、ブラウザのタイトル（「○○(MWSystem)」）から名前を取る
    this.title = l?.name ?? (document.title.replace(/\(MWSystem\)$/, '') || 'MWSystem');
  }

  setDB(test: boolean) {
    if (test) {
      localStorage.setItem('MWSYS_DB', 'test');
    } else {
      localStorage.removeItem('MWSYS_DB');
    }
    window.location.reload();
  }
}
