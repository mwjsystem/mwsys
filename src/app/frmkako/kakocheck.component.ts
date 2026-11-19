import { Component, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { VendsService } from './../mstvendor/vends.service';
import { KAKO_KINDS, KAKO_STEPS, KakoDen, KakoService, stepName } from './kako.service';
import { KakoFigure, kakoFigure } from './kakofig';

/**
 * 加工指示の状態（各拠点のスマホ）。加工指示書の QR コードを読むと開く。
 * 今の状態と各段階の日時を出し、「次の段階にする」で状態を進める（間違えたら 1 つ戻せる）。操作ログに残る
 */
@Component({
  selector: 'app-kakocheck',
  template: `
    <div class="pick">
      @if (dbMismatch) {
        <div class="msg ng">
          この指示書は{{dbMismatch == 'test' ? 'テスト環境' : '本番環境'}}のものですが、このスマホは{{dbMismatch == 'test' ? '本番環境' : 'テスト環境'}}につながっています。
          <button mat-flat-button color="warn" type="button" (click)="switchDb()">{{dbMismatch == 'test' ? 'テスト環境' : '本番環境'}}に切り替えて開く</button>
        </div>
      }
      <div class="head">
        <div class="denno">連番 {{den?.renban ?? ''}}　<span class="sub">加工指示 {{den?.kno ?? kno}}</span></div>
        @if (den) {
          <div>{{kindName}}　加工先 <b>{{destName}}</b></div>
          <div>{{den.tdenno ? '展開 ' + den.tdenno : '受注 ' + den.jdenno}}　{{den.mname}}</div>
          <div class="sub">内勤 {{stfsrv.getName(den.tcode) || den.tcode}}　依頼日 {{den.reqday}}　{{den.wishday ? '希望納期' : '予定納期'}} <b>{{den.wishday || den.planday}}</b>　同梱{{den.doukon ? '有' : '無'}}</div>
        }
      </div>
      @if (msg) {
        <div class="msg" [class.ok]="msgType == 'ok'" [class.ng]="msgType == 'ng'">{{msg}}</div>
      }
      @if (den) {
        @if (den.del) {
          <div class="msg ng">この加工指示は取り消されています</div>
        }
        <div class="item">
          <div class="code">{{den.naiyo}}</div>
          @for (l of den.lines; track l.line) {
            <div class="name"><b>{{l.gcode}}</b> × {{l.suu}}<br><span class="memo">{{l.gtext}}</span></div>
          }
        </div>
        @if (den.photo) {
          <img [src]="den.photo" alt="商品の写真" style="width: 100%; border: 1px solid #dddddd; margin: 4px 0;">
        }
        @if (fig) {
          <img [src]="fig.url" alt="指示書の図" style="width: 100%; border: 1px solid #dddddd; margin: 4px 0;">
        }
        @for (s of steps; track $index; let i = $index) {
          <div class="item" [class.done]="den.status >= i + 1">
            <div class="code">{{den.status >= i + 1 ? '☑' : '☐'}} {{i + 1}}. {{s}}</div>
            <div class="memo">
              @if (i == 0) {<span>{{den.reqday}}</span>} @else if (den.steps[i + 1]?.at) {<span>{{den.steps[i + 1].at | date:'M/d HH:mm'}} {{byName(den.steps[i + 1].by)}}</span>}
            </div>
          </div>
        }
        <div class="buttons">
          @if (!den.del && den.status < 6) {
            <button mat-flat-button color="accent" type="button" class="big" (click)="next()" [disabled]="busy">
              <mat-icon>task_alt</mat-icon>「{{stepName(den.status + 1)}}」にする
            </button>
          }
          @if (!den.del && den.status > 1) {
            <button mat-stroked-button type="button" (click)="back()" [disabled]="busy">間違えたので「{{stepName(den.status - 1)}}」に戻す</button>
          }
        </div>
      }
    </div>
  `,
  styleUrls: ['./../frmship/pick.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatButton, MatIcon, DatePipe]
})
export class KakocheckComponent implements AfterViewInit {
  stfsrv = inject(StaffService);
  private strsrv = inject(StoreService);
  private vensrv = inject(VendsService);
  private kakosrv = inject(KakoService);
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly steps = KAKO_STEPS;
  readonly stepName = stepName;
  kno = 0;
  den?: KakoDen;
  /** 指示書の図（位置と内容から描く） */
  fig: KakoFigure | null = null;
  msg = '';
  msgType: 'ok' | 'ng' | 'info' = 'info';
  dbMismatch = '';
  busy = false;

  constructor() {
    this.title.setTitle('加工の状態(MWSystem)');
  }

  ngAfterViewInit(): void {
    // 倉庫・担当者は、ログインの情報（会社）が入ってから読む
    this.strsrv.getStore().then(() => this.cdRef.detectChanges());
    if (this.stfsrv.tcds.length <= 1) {
      this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    }
    const db = this.route.snapshot.queryParamMap.get('db');
    const isTest = localStorage.getItem('MWSYS_DB') != null;
    if ((db == 'test') != isTest) {
      this.dbMismatch = db == 'test' ? 'test' : 'prod';
    }
    this.kno = Number(this.route.snapshot.paramMap.get('kno') ?? 0);
    if (!this.kno) {
      this.show('加工指示書の QR コードを、スマホのカメラで読んでください', 'info');
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

  get kindName(): string {
    return KAKO_KINDS.find(k => k.value == this.den?.kind)?.name ?? '';
  }

  get destName(): string {
    const d = this.den;
    if (!d) {
      return '';
    }
    return d.dtype == 'V' ? (this.vensrv.getVcdtxt(d.dcode) || d.dcode) : (this.strsrv.scds.find(s => s.value == d.dcode)?.viewval ?? d.dcode);
  }

  byName(by: string | null): string {
    return by == 'auto' ? '自動' : (this.stfsrv.getName(by ?? '') || by || '');
  }

  async open() {
    this.busy = true;
    this.show('加工指示 ' + this.kno + ' を読み込んでいます…', 'info');
    this.cdRef.detectChanges();
    try {
      const d = await this.kakosrv.load(this.kno);
      if (!d) {
        this.show('加工指示 ' + this.kno + ' が見つかりません', 'ng');
      } else {
        this.den = d;
        this.fig = await kakoFigure(d.posis, d.lines.map(l => l.gcode));
        if (d.dtype == 'V' && this.vensrv.vends.length == 0) {
          await this.vensrv.getVendors();
        }
        this.show(d.status >= 6 ? '出荷済です' : '今は「' + stepName(d.status) + '」です。済んだら下のボタンを押してください', 'info');
      }
    } catch (e) {
      this.show('加工指示を読めませんでした：' + (e as Error).message, 'ng');
      console.log('error kakocheck open', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  async next() {
    const d = this.den;
    if (!d || d.status >= 6) {
      return;
    }
    await this.change(d.status + 1, d.status);
  }

  async back() {
    const d = this.den;
    if (!d || d.status <= 1) {
      return;
    }
    if (!confirm('「' + stepName(d.status - 1) + '」に戻します。よろしいですか？')) {
      return;
    }
    await this.change(d.status - 1, d.status);
  }

  private async change(to: number, from: number) {
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      await this.kakosrv.setStatus(this.kno, to, from);
      this.den = (await this.kakosrv.load(this.kno)) ?? this.den;
      this.show('「' + stepName(to) + '」にしました', 'ok');
    } catch (e) {
      this.show('状態を変えられませんでした：' + (e as Error).message, 'ng');
      console.log('error kakocheck change', e);
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
