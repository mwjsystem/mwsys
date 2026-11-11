import { Component, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { TenDen, TenkaiService } from './tenkai.service';
import { tenTasks } from './tenprint.component';

/**
 * 展開完了（倉庫のスマホ）。展開指示書の QR コードを読むと開く。
 * 作業（使う商品 → 作る商品）ごとに済んだものを押して印を付け、「展開完了」で展開完了日を今日にして、
 * 作る商品（入庫）を在庫に足す（操作ログに「展開変更 … 完了日=」として残る）
 */
@Component({
  selector: 'app-tencheck',
  template: `
    <div class="pick">
      @if (dbMismatch) {
        <div class="msg ng">
          この指示書は{{dbMismatch == 'test' ? 'テスト環境' : '本番環境'}}のものですが、このスマホは{{dbMismatch == 'test' ? '本番環境' : 'テスト環境'}}につながっています。
          <button mat-raised-button color="warn" type="button" (click)="switchDb()">{{dbMismatch == 'test' ? 'テスト環境' : '本番環境'}}に切り替えて開く</button>
        </div>
      }
      <div class="head">
        <div class="denno">展開伝票 {{den?.denno ?? denno}}</div>
        @if (den) {
          <div>{{storeName(den.scode)}}　依頼日 {{den.day}}　担当 {{stfsrv.getName(den.tcode) || den.tcode}}</div>
          <div class="sub">{{den.cday ? '展開完了（' + den.cday + '）' : '未完了'}}</div>
        }
      </div>
      @if (msg) {
        <div class="msg" [class.ok]="msgType == 'ok'" [class.ng]="msgType == 'ng'">{{msg}}</div>
      }
      @if (den) {
        <div class="progress">済 {{doneCount}} / {{tasks.length}} 作業</div>
        @for (t of tasks; track t.no) {
          <div class="item" [class.done]="checked[t.no]" (click)="toggle(t.no)">
            <div class="code">{{checked[t.no] ? '☑' : '☐'}} 作業 {{t.no}}</div>
            @for (l of t.outs; track l.line) {
              <div class="name">使う：<b>{{l.gcode}}</b> × {{l.suu}}{{l.unit}}@if (l.tanano) {<span class="tana">棚{{l.tanano}}</span>}<br><span class="memo">{{l.gtext}}</span></div>
            }
            @for (l of t.ins; track l.line) {
              <div class="name">作る：<b>{{l.gcode}}</b> × {{l.suu}}{{l.unit}}<br><span class="memo">{{l.gtext}}</span></div>
            }
          </div>
        }
        <div class="buttons">
          @if (!den.cday) {
            <button mat-raised-button [color]="allDone ? 'accent' : 'warn'" type="button" class="big" (click)="complete()" [disabled]="busy">
              <mat-icon>task_alt</mat-icon>{{allDone ? '展開完了' : '済でない作業があります（展開完了）'}}
            </button>
          } @else {
            <p class="sub">展開完了の伝票です。作る商品は {{den.cday}} に在庫へ入っています。</p>
          }
        </div>
      }
    </div>
  `,
  styleUrls: ['./../frmship/pick.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatButton, MatIcon]
})
export class TencheckComponent implements AfterViewInit {
  private usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  private strsrv = inject(StoreService);
  private tensrv = inject(TenkaiService);
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  denno = 0;
  den?: TenDen;
  tasks: ReturnType<typeof tenTasks> = [];
  /** 作業番号 → 済の印 */
  checked: Record<number, boolean> = {};
  msg = '';
  msgType: 'ok' | 'ng' | 'info' = 'info';
  dbMismatch = '';
  busy = false;

  constructor() {
    this.title.setTitle('展開完了(MWSystem)');
    this.strsrv.getStore();
    if (this.stfsrv.tcds.length == 0) {
      this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    }
  }

  ngAfterViewInit(): void {
    const db = this.route.snapshot.queryParamMap.get('db');
    const isTest = localStorage.getItem('MWSYS_DB') != null;
    if ((db == 'test') != isTest) {
      this.dbMismatch = db == 'test' ? 'test' : 'prod';
    }
    this.denno = Number(this.route.snapshot.paramMap.get('denno') ?? 0);
    if (!this.denno) {
      this.show('展開指示書の QR コードを、スマホのカメラで読んでください', 'info');
    } else if (!this.dbMismatch) {
      this.open();
    }
    this.cdRef.detectChanges();
  }

  switchDb() {
    if (this.dbMismatch == 'test') {
      localStorage.setItem('MWSYS_DB', 'test');
    } else {
      localStorage.removeItem('MWSYS_DB');
    }
    window.location.reload();
  }

  storeName(code: string): string {
    return this.strsrv.scds.find(s => s.value == code)?.viewval ?? code;
  }

  get doneCount(): number {
    return this.tasks.filter(t => this.checked[t.no]).length;
  }

  get allDone(): boolean {
    return this.tasks.length > 0 && this.doneCount == this.tasks.length;
  }

  async open() {
    this.busy = true;
    this.show('展開伝票 ' + this.denno + ' を読み込んでいます…', 'info');
    this.cdRef.detectChanges();
    try {
      const d = await this.tensrv.load(this.denno);
      if (!d) {
        this.show('展開伝票 ' + this.denno + ' が見つかりません', 'ng');
      } else {
        this.den = d;
        this.tasks = tenTasks(d.lines);
        this.checked = {};
        if (d.cday) {
          this.tasks.forEach(t => this.checked[t.no] = true);
          this.show('この伝票は展開完了です（' + d.cday + '）', 'info');
        } else {
          this.show('済んだ作業を押して印を付け、最後に「展開完了」を押してください', 'info');
        }
      }
    } catch (e) {
      this.show('展開伝票を読めませんでした：' + (e as Error).message, 'ng');
      console.log('error tencheck open', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  toggle(no: number) {
    if (this.den?.cday) {
      return;
    }
    this.checked[no] = !this.checked[no];
  }

  /** 展開完了日を今日にして、作る商品（入庫）を在庫に足す */
  async complete() {
    const d = this.den;
    if (!d || d.cday) {
      return;
    }
    if (!this.allDone && !confirm('済の印が付いていない作業があります。それでも展開完了にしますか？')) {
      return;
    }
    const today = this.usrsrv.formatDate(new Date());
    const cday = today < d.day ? d.day : today;
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      this.den = await this.tensrv.complete(d, cday);
      this.tasks.forEach(t => this.checked[t.no] = true);
      this.show('展開完了にしました（' + cday + '）。作る商品を在庫に入れました', 'ok');
    } catch (e) {
      this.show('展開完了にできませんでした：' + (e as Error).message, 'ng');
      console.log('error tencheck complete', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  private show(text: string, type: 'ok' | 'ng' | 'info') {
    this.msg = text;
    this.msgType = type;
    if (type != 'info') {
      navigator.vibrate?.(type == 'ok' ? 80 : [200, 100, 200]);
    }
  }
}
