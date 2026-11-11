import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Injectable, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { StockService } from './../services/stock.service';
import { StoreService } from './../services/store.service';
import { UserService } from './../services/user.service';
import { MovingService, MoveRequest } from './../frmmove/moving.service';

/** 受注明細のうち、出荷倉庫の在庫が足りないかもしれない行（保存の前に入力中の明細から選ぶ） */
export interface ShortRow { line: number; gcode: string; gtext: string; scode: string; suu: number; pable: number }

/** 他の倉庫の受注可能数 */
export interface StoreStock { scode: string; name: string; pable: number }

/** 移動を勧める明細 */
export interface MoveCandidate extends ShortRow {
  /** 足りない数（数量 − 出荷倉庫の受注可能数） */
  short: number;
  /** 在庫のある他の倉庫（受注可能数の多い順） */
  stores: StoreStock[];
}

/**
 * 受注伝票の在庫不足と、他の倉庫の在庫を調べる。
 * 対象は在庫品（数量区分 0）で、受発注（在庫種別 3）以外の、出荷倉庫の受注可能数が数量より少ない明細。
 * もう移動伝票を作った明細（移動明細に受注伝票番号・行番号がある）は除く
 */
@Injectable({ providedIn: 'root' })
export class MoveSuggestService {
  private stcsrv = inject(StockService);
  private strsrv = inject(StoreService);
  private movsrv = inject(MovingService);

  /** 入力中の明細から、在庫が足りないかもしれない行を選ぶ（保存の前に呼ぶ。保存すると明細を読み直すため） */
  shortRows(rows: { line: number; gcode: string; gtext: string; suu: number; pable: number | null; scode: string; spec: string | null; gskbn: string }[]): ShortRow[] {
    return rows
      .filter(r => r.gcode && r.gskbn == '0' && r.spec != '3' && r.scode && Number(r.suu) > 0 && r.pable != null && Number(r.pable) < Number(r.suu))
      .map(r => ({ line: Number(r.line), gcode: r.gcode, gtext: r.gtext ?? '', scode: r.scode, suu: Number(r.suu), pable: Number(r.pable) }));
  }

  /** 他の倉庫に在庫がある不足の明細 */
  async candidates(jdenno: number, rows: ShortRow[]): Promise<MoveCandidate[]> {
    if (rows.length == 0) {
      return [];
    }
    const moved = await this.movsrv.movesOf(jdenno);
    const targets = rows.filter(r => !moved.has(r.line));
    const stores = this.strsrv.scds;
    const ret: MoveCandidate[] = [];
    for (const r of targets) {
      const list = await Promise.all(stores.filter(s => s.value != r.scode).map(async s => {
        const st = (await this.stcsrv.getStock(r.gcode, '0', String(s.value)))[0];
        const pable = st ? Number(st.stock ?? 0) - Number(st.hikat ?? 0) - Number(st.keepd ?? 0) : 0;
        return { scode: String(s.value), name: s.viewval, pable };
      }));
      const have = list.filter(s => s.pable > 0).sort((a, b) => b.pable - a.pable);
      if (have.length > 0) {
        ret.push({ ...r, short: r.suu - Math.max(r.pable, 0), stores: have });
      }
    }
    return ret;
  }
}

export interface MovesuggestData {
  jdenno: number;
  candidates: MoveCandidate[];
}

/** ダイアログの 1 行（選んだ移動元と数量） */
interface MovePick { c: MoveCandidate; on: boolean; from: string; suu: number }

/**
 * 受注伝票の在庫不足を、他の倉庫から移動する移動伝票を作るダイアログ。
 * 明細ごとに移動元の倉庫と数量を選び、出庫倉庫 → 入庫倉庫（受注明細の出荷倉庫）ごとに移動伝票を作る
 */
@Component({
  selector: 'app-movesuggest',
  template: `
    <h2 mat-dialog-title>他の倉庫から移動（受注伝票 {{data.jdenno}}）</h2>
    <mat-dialog-content>
      <p class="hint">出荷倉庫の在庫が足りない商品が、他の倉庫にあります。移動元と数量を確かめて「移動伝票を作る」を押してください（移動日は今日です）。</p>
      <table class="tbl">
        <tr><th></th><th>行</th><th>商品</th><th>出荷倉庫</th><th class="num">数量</th><th class="num">不足</th><th>移動元（受注可能数）</th><th class="num">移動数</th></tr>
        @for (p of picks; track p.c.line) {
          <tr [class.off]="!p.on">
            <td><input type="checkbox" [checked]="p.on" (change)="p.on = $any($event.target).checked"></td>
            <td>{{p.c.line}}</td>
            <td><b>{{p.c.gcode}}</b><br><span class="sub">{{p.c.gtext}}</span></td>
            <td>{{storeName(p.c.scode)}}</td>
            <td class="num">{{p.c.suu}}</td>
            <td class="num">{{p.c.short}}</td>
            <td>
              <select (change)="setFrom(p, $any($event.target).value)">
                @for (s of p.c.stores; track s.scode) {
                  <option [value]="s.scode" [selected]="s.scode == p.from">{{s.name}}（{{s.pable}}）</option>
                }
              </select>
            </td>
            <td class="num"><input type="number" min="1" class="suu" [value]="p.suu" (input)="p.suu = +$any($event.target).value"></td>
          </tr>
        }
      </table>
      @if (error) {
        <div class="err">{{error}}</div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">今は作らない</button>
      <button mat-flat-button color="primary" type="button" (click)="make()" [disabled]="busy || !picks.some(p => p.on && p.suu > 0)">
        <mat-icon>local_shipping</mat-icon>移動伝票を作る
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .hint { font-size: 13px; color: #555555; }
    .tbl { border-collapse: collapse; width: 100%; font-size: 13px; }
    .tbl th, .tbl td { border-bottom: 1px solid #dddddd; padding: 4px 6px; text-align: left; vertical-align: middle; }
    .tbl .num { text-align: right; }
    .tbl tr.off td { color: #999999; }
    .sub { font-size: 11px; color: #666666; }
    select { font-size: 13px; padding: 2px; }
    .suu { width: 5em; text-align: right; font-size: 13px; }
    .err { color: #c62828; margin-top: 8px; }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, MatIcon]
})
export class MovesuggestComponent {
  data = inject<MovesuggestData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<MovesuggestComponent, { denno: number; outcode: string; incode: string }[]>);
  private movsrv = inject(MovingService);
  private strsrv = inject(StoreService);
  private usrsrv = inject(UserService);
  private cdRef = inject(ChangeDetectorRef);

  picks: MovePick[] = this.data.candidates.map(c => ({ c, on: true, from: c.stores[0].scode, suu: Math.min(c.short, c.stores[0].pable) }));
  busy = false;
  error = '';

  storeName(code: string): string {
    return this.strsrv.scds.find(s => s.value == code)?.viewval ?? code;
  }

  setFrom(p: MovePick, scode: string) {
    p.from = scode;
    const s = p.c.stores.find(e => e.scode == scode);
    p.suu = Math.min(p.c.short, s?.pable ?? p.suu);
  }

  async make() {
    const reqs: MoveRequest[] = this.picks.filter(p => p.on && p.suu > 0).map(p => ({
      outcode: p.from, incode: p.c.scode, gcode: p.c.gcode, suu: p.suu,
      jdenno: this.data.jdenno, jline: p.c.line, memo: '受注' + this.data.jdenno + '-' + p.c.line
    }));
    const over = this.picks.filter(p => p.on && p.suu > (p.c.stores.find(s => s.scode == p.from)?.pable ?? 0));
    if (over.length && !confirm(over.map(p => p.c.gcode).join('、') + ' は移動元の受注可能数を超えています。このまま作りますか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      const made = await this.movsrv.createMoves(reqs);
      this.usrsrv.toastSuc('移動伝票 ' + made.map(m => m.denno + '（' + this.storeName(m.outcode) + '→' + this.storeName(m.incode) + '）').join('、') + ' を作りました');
      this.ref.close(made);
    } catch (e) {
      this.error = '移動伝票を作れませんでした：' + (e as Error).message;
      console.log('error createMoves', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
