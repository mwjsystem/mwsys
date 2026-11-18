import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { TANKA_KEYS, TankaKey } from './goods-const';

/** 単価の 1 行（有効開始日ごと） */
interface TankaRow {
  gcode: string; day: string;
  tanka1: number; tanka2: number; tanka3: number; tanka4: number; tanka5: number; tanka6: number; tanka7: number; tanka8: number; tanka9: number;
  cost: number | null; genka: number | null; taxrate: string | null; currency: string | null;
}
/** 特別単価の 1 行 */
interface SptnkRow { gcode: string; sptnkbn: string; day: string; sptanka: number }


/**
 * 単価の履歴（商品マスタ → 単価の履歴）。商品グループの全商品の、有効開始日ごとの単価と特別単価を出す。
 * 画面の単価の表は最新の 1 行だけなので、価格改定の前後を見比べるのに使う
 */
@Component({
  selector: 'app-gtnkhis',
  template: `
    <h2 mat-dialog-title>単価の履歴 {{data.grpcd}}</h2>
    <mat-dialog-content>
      @if (loading) {<div>読み込み中…</div>}
      @if (error) {<div class="err">{{error}}</div>}
      <table class="tbl">
        <thead>
          <tr>
            <th>商品コード</th><th>有効開始日</th>
            @for (k of keys; track k) {<th class="num">{{label(k)}}</th>}
            <th class="num">営業原価</th><th class="num">仕入原価</th><th>税率</th>
          </tr>
        </thead>
        <tbody>
          @for (r of tankas; track r.gcode + r.day; let i = $index) {
            <tr [class.top]="i == 0 || tankas[i - 1].gcode != r.gcode" [class.cur]="isCurrent(r)">
              <td>{{(i == 0 || tankas[i - 1].gcode != r.gcode) ? r.gcode : ''}}</td>
              <td>{{r.day}}@if (isCurrent(r)) {<span class="now">現在</span>}@if (r.day > today) {<span class="fut">予定</span>}</td>
              @for (k of keys; track k) {<td class="num" [class.chg]="changed(i, k)">{{r[k] | number}}</td>}
              <td class="num">{{r.cost | number}}</td><td class="num">{{r.genka | number}} {{r.currency == 'USD' ? 'USD' : ''}}</td><td>{{r.taxrate}}%</td>
            </tr>
          }
        </tbody>
      </table>
      @if (sptnks.length > 0) {
        <h3>特別単価</h3>
        <table class="tbl">
          <thead><tr><th>商品コード</th><th>特別単価区分</th><th>有効開始日</th><th class="num">特別単価</th></tr></thead>
          <tbody>
            @for (s of sptnks; track s.gcode + s.sptnkbn + s.day) {
              <tr><td>{{s.gcode}}</td><td>{{s.sptnkbn}} {{spName(s.sptnkbn)}}</td><td>{{s.day}}</td><td class="num">{{s.sptanka | number}}</td></tr>
            }
          </tbody>
        </table>
      }
      <div class="hint">通販定価は税込、ほかの単価は税抜です。色の付いた数字は、一つ前の有効開始日から変わった単価です。</div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">閉じる</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .err { color: #c62828; }
    .tbl { border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
    .tbl th, .tbl td { border-bottom: 1px solid #dddddd; padding: 3px 6px; text-align: left; white-space: nowrap; }
    .tbl th { background: #eeeeee; font-weight: normal; }
    .tbl .num { text-align: right; }
    .tbl tr.top td { border-top: 2px solid #999999; }
    .tbl tr.cur td { background: #f1f8e9; }
    .tbl td.chg { color: #c62828; font-weight: bold; }
    .now { margin-left: 4px; font-size: 11px; color: #ffffff; background: #2e7d32; padding: 0 4px; border-radius: 3px; }
    .fut { margin-left: 4px; font-size: 11px; color: #ffffff; background: #1565c0; padding: 0 4px; border-radius: 3px; }
    .hint { font-size: 12px; color: #666666; }
    h3 { font-size: 14px; margin: 8px 0 4px; }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, DecimalPipe]
})
export class GtnkhisComponent implements OnInit {
  ref = inject(MatDialogRef<GtnkhisComponent>);
  data = inject<{ grpcd: string }>(MAT_DIALOG_DATA);
  bunsrv = inject(BunruiService);
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);
  private cdRef = inject(ChangeDetectorRef);

  keys = TANKA_KEYS;
  tankas: TankaRow[] = [];
  sptnks: SptnkRow[] = [];
  loading = true;
  error = '';
  today = this.usrsrv.formatDate(new Date());

  async ngOnInit() {
    const Get = gql`
      query get_tanka_history($id: smallint!, $grp: String!) {
        msgoods(where: {id: {_eq: $id}, code: {_eq: $grp}}, order_by: {gcode: asc}) {
          gcode
          msgtankas(order_by: {day: desc}) {
            day tanka1 tanka2 tanka3 tanka4 tanka5 tanka6 tanka7 tanka8 tanka9 cost genka taxrate currency
          }
          msgsptnks(order_by: [{sptnkbn: asc}, {day: desc}]) { sptnkbn day sptanka }
        }
      }`;
    try {
      this.bunsrv.qryBunrui().then(() => this.cdRef.detectChanges()).catch(() => undefined);
      type GoodsRow = { gcode: string; msgtankas: Omit<TankaRow, 'gcode'>[]; msgsptnks: Omit<SptnkRow, 'gcode'>[] };
      const res = await firstValueFrom(this.apollo.query<{ msgoods: GoodsRow[] }>({
        query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, grp: this.data.grpcd }
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('単価を読めませんでした');
      }
      this.tankas = res.data.msgoods.flatMap(g => g.msgtankas.map(r => ({ ...r, gcode: g.gcode, day: String(r.day).slice(0, 10) })));
      this.sptnks = res.data.msgoods.flatMap(g => g.msgsptnks.map(r => ({ ...r, gcode: g.gcode, day: String(r.day).slice(0, 10) })));
    } catch (e) {
      this.error = '単価の履歴を読めませんでした：' + (e as Error).message;
      console.log('error gtnkhis', e);
    }
    this.loading = false;
    this.cdRef.detectChanges();
  }

  spName(v: string): string {
    return this.bunsrv.kbn['sptnkbn']?.find(s => s.value == v)?.viewval ?? '';
  }

  label(k: string): string {
    const sys = this.usrsrv.system as unknown as Record<string, string> | undefined;
    return String(sys?.['tnk' + k.slice(5) + 'txt'] ?? k);
  }

  /** 受注で使われる単価（今日より前で一番新しい行。受注は「受注日より前」の単価を使う） */
  isCurrent(r: TankaRow): boolean {
    const cur = this.tankas.find(t => t.gcode == r.gcode && t.day < this.today);
    return cur === r;
  }

  /** 一つ前（古い方）の行から変わったか */
  changed(i: number, k: TankaKey): boolean {
    const r = this.tankas[i];
    const prev = this.tankas[i + 1];
    return !!prev && prev.gcode == r.gcode && Number(prev[k]) != Number(r[k]);
  }
}
