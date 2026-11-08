import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { UserService } from './../services/user.service';
import { StoreService } from './../services/store.service';
import { lineMoney } from './../frmrakuten/rakuten-parse';
import { ObiService } from './obi.service';
import { ObiLine, ObiOrder, OBI_KINDS, MALL_GCODE, parseObiSheet, sheetRows } from './obi-parse';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import { DenlinkComponent } from './../share/denlink/denlink.component';

/**
 * 帯の注文用紙の取込（第 1 段階：色帯の表 CB19・CB-K・CBKK1・CB19-H）。
 * 道場ごとの注文用紙 Excel を読み込み、用紙ごとに確認してから受注伝票に登録する。
 */
@Component({
  selector: 'app-frmobi',
  templateUrl: './frmobi.component.html',
  styleUrls: ['./../frmocnk/frmocnk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatToolbar, MatButton, MatIcon, FormsModule, DecimalPipe, DenlinkComponent]
})
export class FrmobiComponent implements OnInit {
  private srv = inject(ObiService);
  private usrsrv = inject(UserService);
  strsrv = inject(StoreService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly kinds = OBI_KINDS;
  readonly mallCode = MALL_GCODE;
  orders: ObiOrder[] = [];
  busy = false;
  error = '';
  message = '';
  progress = '';
  private today = '';
  /** 用紙のセル（種類を変えたときに読み直す） */
  private rows = new WeakMap<ObiOrder, string[][]>();

  constructor() {
    this.title.setTitle('帯注文取込(MWSystem)');
  }

  ngOnInit() {
    this.strsrv.getStore();
  }

  get envName(): string {
    return localStorage.getItem('MWSYS_DB') != null ? 'テスト環境' : '本番環境';
  }

  money(o: ObiOrder, l: ObiLine): number {
    return lineMoney({ tanka: l.tanka, suu: l.qty, mtax: this.srv.mtax(o), taxrate: l.taxrate }).money;
  }

  amount(o: ObiOrder): number {
    return o.lines.reduce((s, l) => s + this.money(o, l), 0);
  }

  /** 銀線（MALL）の単価を画面で変えたとき（顧客コードを直して読み直しても残す） */
  setMall(l: ObiLine, v: number | string | null) {
    const n = Math.max(0, Math.round(Number(v) || 0));
    l.tanka = n;
    l.fixed = n;
  }

  taxName(o: ObiOrder): string {
    return this.srv.mtax(o) == '1' ? '税込' : '税抜';
  }

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length == 0) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.message = '';
    this.orders = [];
    this.cdRef.detectChanges();
    const errs: string[] = [];
    try {
      const lib = await import('exceljs');
      const ExcelJS = (lib as unknown as { default?: typeof lib }).default ?? lib;
      this.today = this.usrsrv.formatDate(new Date());
      for (const f of files) {
        const wb = new ExcelJS.Workbook();
        try {
          await wb.xlsx.load(await f.arrayBuffer());
        } catch (e) {
          errs.push(f.name + '：Excel を開けませんでした（' + (e as Error).message + '）');
          continue;
        }
        let found = 0;
        wb.eachSheet(ws => {
          if (ws.state != 'visible') {
            return;
          }
          const rows = sheetRows(ws);
          const o = parseObiSheet(rows, f.name, ws.name);
          if (o) {
            this.rows.set(o, rows);
            this.orders.push(o);
            found++;
          }
        });
        if (found == 0) {
          errs.push(f.name + '：色帯の表（0号〜8号）が見つかりません（黒帯・名前刺繍の用紙はまだ取り込めません）');
        }
      }
      for (const o of this.orders) {
        await this.srv.resolve(o, this.today);
      }
    } catch (e) {
      errs.push('読み込めませんでした：' + (e as Error).message);
      console.log('error frmobi file', e);
    }
    this.error = errs.join('\n');
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 顧客コードを直したとき */
  async changeMcode(o: ObiOrder) {
    this.busy = true;
    try {
      await this.srv.resolve(o, this.today);
    } catch (e) {
      o.err = (e as Error).message;
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 帯の種類を変えたとき（用紙を読み直す。顧客コードは画面の値のまま） */
  async changeKind(o: ObiOrder, kind: string) {
    const rows = this.rows.get(o);
    const n = rows ? parseObiSheet(rows, o.fileName, o.sheet, kind) : null;
    if (!n || !rows) {
      return;
    }
    n.mcode = o.mcode;
    this.rows.set(n, rows);
    this.orders = this.orders.map(e => e == o ? n : e);
    await this.changeMcode(n);
  }

  private target(o: ObiOrder): boolean {
    return !o.err && !o.result.startsWith('登録済') && !o.result.startsWith('スキップ');
  }

  get targetCount(): number {
    return this.orders.filter(o => this.target(o)).length;
  }

  async register() {
    const list = this.orders.filter(o => this.target(o));
    if (list.length == 0 || !confirm('接続先：' + this.envName + '\n\n帯の注文 ' + list.length + ' 件を登録します。よろしいですか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    let ok = 0, skip = 0, ng = 0;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      this.progress = '登録中 ' + (i + 1) + ' / ' + list.length + '  ' + o.fileName;
      this.cdRef.detectChanges();
      try {
        o.result = await this.srv.register(o, this.today);
        if (o.result.startsWith('登録済')) {
          ok++;
        } else {
          skip++;
        }
      } catch (e) {
        o.result = 'エラー：' + (e as Error).message;
        ng++;
        console.log('error frmobi register', o.fileName, e);
      }
    }
    this.progress = '';
    this.message = '登録 ' + ok + ' 件、スキップ ' + skip + ' 件、エラー ' + ng + ' 件';
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
