import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import * as FileSaver from 'file-saver';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { UserService } from './../services/user.service';
import { StoreService } from './../services/store.service';
import { StaffService } from './../services/staff.service';
import { loadExcelJs, excelBuffer } from './../services/busy.service';
import { TanaEnt, TanaService, TanaSum } from './tana.service';

/** 画面の 1 行（確定するかの印を付ける） */
interface SumRow extends TanaSum { on: boolean; open: boolean }

/**
 * 棚卸集計・一括確定。一斉棚卸の下書き（スマホ・単票・CSV で場所ごとに数えた数）を商品ごとに合計し、
 * システム在庫・登録済みの棚卸と並べる（現行の Excel の「集計編集」にあたる）。印を付けた商品を一括で棚卸に登録する。
 * 現行の「投入データ」の CSV（倉庫, 日付, 商品コード, 空欄, 数）も取り込める
 */
@Component({
  selector: 'app-tanasum',
  templateUrl: './tanasum.component.html',
  styleUrls: ['./tanasum.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, RouterLink, MatToolbar, MatButton, MatIcon, MatTooltip]
})
export class TanasumComponent {
  usrsrv = inject(UserService);
  strsrv = inject(StoreService);
  stfsrv = inject(StaffService);
  private tanasrv = inject(TanaService);
  private apollo = inject(Apollo);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  scode = this.usrsrv.staff?.scode ?? '';
  day = this.usrsrv.formatDate(new Date());
  /** 数えていなくても、システム在庫がある商品も出す（数え忘れの確認） */
  withStock = false;
  /** 差異のある商品だけ出す */
  diffOnly = false;
  sort: 'diff' | 'tanano' | 'gcode' = 'diff';
  rows: SumRow[] = [];
  loaded = false;
  busy = false;
  message = '';
  error = '';

  constructor() {
    this.title.setTitle('棚卸集計(MWSystem)');
    this.strsrv.getStore();
    if (this.stfsrv.tcds.length == 0) {
      this.stfsrv.getStaff();
    }
  }

  /** 棚卸数（数えていない商品は 0） */
  countOf(r: TanaSum): number {
    return r.count ?? 0;
  }

  diffOf(r: TanaSum): number {
    return this.countOf(r) - r.stock;
  }

  get shown(): SumRow[] {
    let list = this.rows;
    if (this.diffOnly) {
      list = list.filter(r => this.diffOf(r) != 0);
    }
    const s = [...list];
    if (this.sort == 'diff') {
      s.sort((a, b) => Math.abs(this.diffOf(b)) - Math.abs(this.diffOf(a)) || a.gcode.localeCompare(b.gcode));
    } else if (this.sort == 'tanano') {
      s.sort((a, b) => (a.tanano || '￿').localeCompare(b.tanano || '￿') || a.gcode.localeCompare(b.gcode));
    } else {
      s.sort((a, b) => a.gcode.localeCompare(b.gcode));
    }
    return s;
  }

  get checkedCount(): number {
    return this.rows.filter(r => r.on).length;
  }

  get counted(): number {
    return this.rows.filter(r => r.count != null).length;
  }

  get uncounted(): number {
    return this.rows.filter(r => r.count == null).length;
  }

  locs(r: TanaSum): string {
    return r.ents.map(e => (e.loc || '－') + ':' + e.suu).join('　');
  }

  async load() {
    if (!this.scode || !this.day) {
      this.error = '倉庫と日付を選んでください';
      return;
    }
    this.busy = true;
    this.error = '';
    this.message = '';
    this.cdRef.detectChanges();
    try {
      const list = await this.tanasrv.summary(this.scode, this.day, this.withStock);
      // 数えた商品は確定の印を付けておく（数えていない商品は付けない。0 で確定するときは印を付ける）
      this.rows = list.map(r => ({ ...r, on: r.count != null, open: false }));
      this.loaded = true;
    } catch (e) {
      this.error = '読めませんでした：' + (e as Error).message;
      console.log('error tanasum', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  setAll(on: boolean) {
    this.shown.forEach(r => r.on = on);
  }

  /** 数えていない商品（在庫あり）にも印を付ける（0 で確定する） */
  checkUncounted() {
    this.rows.filter(r => r.count == null).forEach(r => r.on = true);
  }

  async delEnt(r: SumRow, e: TanaEnt) {
    if (!confirm(r.gcode + ' の ' + (e.loc || '') + ' ' + e.suu + ' を消しますか？')) {
      return;
    }
    try {
      await this.tanasrv.deleteEntry(e.sequ);
      r.ents = r.ents.filter(x => x.sequ != e.sequ);
      r.count = r.ents.length ? r.ents.reduce((a, x) => a + x.suu, 0) : null;
    } catch (err) {
      this.error = '消せませんでした：' + (err as Error).message;
    }
    this.cdRef.detectChanges();
  }

  /** 一括確定: 印を付けた商品の棚卸数（下書きの合計。数えていなければ 0）を棚卸に登録する（同じ日は上書き） */
  async confirmAll() {
    const targets = this.rows.filter(r => r.on);
    if (targets.length == 0) {
      return;
    }
    const zero = targets.filter(r => r.count == null).length;
    const diff = targets.filter(r => this.diffOf(r) != 0).length;
    if (!confirm(this.storeName(this.scode) + '・' + this.day + ' の棚卸として ' + targets.length + ' 件を登録します'
      + '（在庫と違う ' + diff + ' 件' + (zero ? '、数えていないので 0 にする ' + zero + ' 件' : '') + '）。\n同じ日に登録済みの商品は上書きします。よろしいですか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      await this.tanasrv.saveTana(this.scode, this.day, targets.map(r => ({ gcode: r.gcode, tana: this.countOf(r), memo: r.ents.length ? '一斉棚卸' : '一斉棚卸（未カウント 0）' })));
      await this.tanasrv.markDone(this.scode, this.day, targets.filter(r => r.ents.length).map(r => r.gcode));
      this.usrsrv.toastSuc(targets.length + ' 件の棚卸を登録しました');
      await this.load();
      this.message = targets.length + ' 件の棚卸を登録しました（在庫に反映済み）';
    } catch (e) {
      this.error = '一括確定できませんでした：' + (e as Error).message;
      console.log('error tanasum confirm', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  storeName(code: string): string {
    return this.strsrv.scds.find(s => s.value == code)?.viewval ?? code;
  }

  // ===================== CSV 取込（現行の投入データ） =====================
  /** 現行の投入データの CSV（倉庫, 日付 yyyymmdd, 商品コード, 空欄, 数。Shift_JIS か UTF-8）を下書きに取り込む */
  async importCsv(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.scode || !this.day) {
      if (!this.scode || !this.day) {
        this.error = '先に倉庫と日付を選んでください';
      }
      return;
    }
    this.busy = true;
    this.error = '';
    this.message = '';
    this.cdRef.detectChanges();
    try {
      const buf = await file.arrayBuffer();
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch {
        text = new TextDecoder('shift_jis').decode(buf);
      }
      const ymd = this.day.replace(/-/g, '');
      const rows: { gcode: string; suu: number }[] = [];
      const other = new Set<string>();
      const bad: string[] = [];
      text.split(/\r?\n/).forEach((line, i) => {
        if (!line.trim()) {
          return;
        }
        const c = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        const n = Number(c[4]);
        if (!c[2] || !Number.isFinite(n)) {
          bad.push(String(i + 1));
          return;
        }
        if (c[0] != this.scode || c[1] != ymd) {
          other.add(c[0] + ' ' + c[1]);
        }
        rows.push({ gcode: c[2], suu: Math.round(n) });
      });
      if (rows.length == 0) {
        throw new Error('取り込める行がありません');
      }
      if (other.size && !confirm('CSV の倉庫・日付（' + [...other].slice(0, 3).join('、') + '）が、選んでいる ' + this.scode + ' ' + ymd + ' と違います。選んでいる倉庫・日付で取り込みますか？')) {
        this.busy = false;
        return;
      }
      // 商品マスタに無い商品は取り込まない
      const known = await this.knownGoods([...new Set(rows.map(r => r.gcode))]);
      const ok = rows.filter(r => known.has(r.gcode));
      const unknown = [...new Set(rows.filter(r => !known.has(r.gcode)).map(r => r.gcode))];
      await this.tanasrv.addEntries(this.scode, this.day, ok.map(r => ({ gcode: r.gcode, loc: 'CSV取込', suu: r.suu })));
      await this.load();
      this.message = ok.length + ' 行を下書きに取り込みました（場所「CSV取込」）'
        + (unknown.length ? '。商品マスタに無いので取り込まなかった商品：' + unknown.slice(0, 20).join('、') + (unknown.length > 20 ? ' ほか' : '') : '')
        + (bad.length ? '。読めなかった行：' + bad.slice(0, 10).join('、') : '');
    } catch (e) {
      this.error = 'CSV を取り込めませんでした：' + (e as Error).message;
      console.log('error tanasum csv', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  private async knownGoods(gcodes: string[]): Promise<Set<string>> {
    const Get = gql`query known_goods($id: smallint!, $gcodes: [String!]!) { msgoods(where: {id: {_eq: $id}, gcode: {_in: $gcodes}}) { gcode } }`;
    const set = new Set<string>();
    for (let i = 0; i < gcodes.length; i += 1000) {
      const res = await firstValueFrom(this.apollo.query<{ msgoods: { gcode: string }[] }>({
        query: Get, variables: { id: this.usrsrv.compid, gcodes: gcodes.slice(i, i + 1000) }
      }));
      if (res.error) {
        throw res.error;
      }
      res.data?.msgoods.forEach(g => set.add(g.gcode));
    }
    return set;
  }

  // ===================== Excel 出力 =====================
  async exportExcel() {
    try {
      const lib = await loadExcelJs();
      const Workbook = lib.Workbook ?? lib.default.Workbook;
      const wb = new Workbook();
      const ws = wb.addWorksheet('棚卸集計');
      ws.addRow(['倉庫', this.scode + ' ' + this.storeName(this.scode), '日付', this.day]);
      ws.addRow([]);
      ws.addRow(['商品コード', '商品名', '棚番', '棚卸数', 'システム在庫', '差異', '差異の絶対値', '登録済', '内訳']);
      for (const r of this.shown) {
        ws.addRow([r.gcode, r.gtext, r.tanano, r.count ?? '', r.stock, this.diffOf(r), Math.abs(this.diffOf(r)), r.done ?? '', this.locs(r)]);
      }
      ws.getRow(3).font = { bold: true };
      ws.columns.forEach((c: { width?: number }, i: number) => c.width = [16, 36, 8, 8, 10, 8, 10, 8, 50][i] ?? 10);
      const buf = await excelBuffer(wb);
      FileSaver.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        '棚卸集計_' + this.scode + '_' + this.day.replace(/-/g, '') + '.xlsx');
    } catch (e) {
      this.error = 'Excel を作れませんでした：' + (e as Error).message;
    }
  }
}
