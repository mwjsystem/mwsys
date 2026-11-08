import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { UserService } from './../services/user.service';
import { sheetRows } from './../frmobi/obi-parse';
import { TaikaiService, HOME_SCODE } from './taikai.service';
import { Taikai, isTaikaiSheet, parseTaikai } from './taikai-parse';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import { DenlinkComponent } from './../share/denlink/denlink.component';

/**
 * 大会リストの登録（現行の make_csv.xlsm の置き換え）。
 * 出荷時は移動伝票（01 → 大会倉庫 5xx）、売上時は受注伝票と戻りの移動伝票（大会倉庫 → 01）を登録する。
 */
@Component({
  selector: 'app-frmtaikai',
  templateUrl: './frmtaikai.component.html',
  styleUrls: ['./../frmocnk/frmocnk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatToolbar, MatButton, MatIcon, FormsModule, DecimalPipe, DenlinkComponent]
})
export class FrmtaikaiComponent implements OnInit {
  private srv = inject(TaikaiService);
  private usrsrv = inject(UserService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly home = HOME_SCODE;
  stores: { code: string; name: string }[] = [];
  /** 大会倉庫 */
  scode = '';
  /** 売上の日付（受注日・売上日・出荷日・戻りの移動伝票の日付） */
  saleDay = '';
  fileName = '';
  /** 大会リストのシート（年ごと） */
  private sheets: { name: string; rows: string[][] }[] = [];
  sheetNames: string[] = [];
  sheet = '';
  t: Taikai | null = null;
  mname = '';
  /** 登録済み（同じ大会名の伝票） */
  shipDenno: number | null = null;
  saleDenno: number | null = null;
  backDenno: number | null = null;
  busy = false;
  error = '';
  message = '';

  constructor() {
    this.title.setTitle('大会リスト(MWSystem)');
  }

  async ngOnInit() {
    this.saleDay = this.usrsrv.formatDate(new Date());
    try {
      this.stores = await this.srv.stores();
    } catch (e) {
      this.error = '倉庫マスタを読めませんでした：' + (e as Error).message;
    }
    this.cdRef.detectChanges();
  }

  get envName(): string {
    return localStorage.getItem('MWSYS_DB') != null ? 'テスト環境' : '本番環境';
  }

  get missing(): number {
    return this.t?.items.filter(i => !i.found).length ?? 0;
  }

  /** Excel の金額が販売価格 × 売上数と違う行 */
  get amountDiff(): string[] {
    return (this.t?.items ?? []).filter(i => i.amount != null && i.amount != i.sales * i.price).map(i => i.row + '行目 ' + i.gcode);
  }

  sum(k: 'prep' | 'stock' | 'sales'): number {
    return this.t?.items.reduce((s, i) => s + i[k], 0) ?? 0;
  }

  get amount(): number {
    return this.t?.items.reduce((s, i) => s + i.sales * i.price, 0) ?? 0;
  }

  get canShip(): boolean {
    return !!this.t && !this.t.err && this.missing == 0 && !!this.scode && !!this.t.shipDay && !this.busy;
  }

  get canSale(): boolean {
    return !!this.t && !this.t.err && this.missing == 0 && !!this.scode && !!this.saleDay && !this.busy && (this.sum('sales') == 0 || !!this.mname);
  }

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.message = '';
    this.t = null;
    this.sheets = [];
    this.cdRef.detectChanges();
    try {
      const lib = await import('exceljs');
      const ExcelJS = (lib as unknown as { default?: typeof lib }).default ?? lib;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      wb.eachSheet(ws => {
        if (ws.state != 'visible') {
          return;
        }
        const rows = sheetRows(ws, 300, 30);
        if (isTaikaiSheet(rows)) {
          this.sheets.push({ name: ws.name, rows });
        }
      });
      if (this.sheets.length == 0) {
        throw new Error('大会リストのシート（大会名と、品番・準備数の見出し）がありません');
      }
      this.fileName = file.name;
      this.sheetNames = this.sheets.map(s => s.name);
      // 年の一番新しいシート（「2026リスト」など）。年が無ければ先頭
      const year = (n: string) => Number(n.match(/(\d{4})/)?.[1] ?? 0);
      this.sheet = [...this.sheetNames].sort((a, b) => year(b) - year(a))[0];
      await this.load();
    } catch (e) {
      this.error = 'Excel を読み込めませんでした：' + (e as Error).message;
      console.log('error frmtaikai file', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** シートを読んで、商品・受注先・登録済みを確認する */
  async load() {
    const s = this.sheets.find(e => e.name == this.sheet);
    if (!s) {
      return;
    }
    this.busy = true;
    this.t = parseTaikai(s.rows, this.fileName, s.name);
    this.mname = '';
    this.shipDenno = this.saleDenno = this.backDenno = null;
    try {
      const r = await this.srv.resolve(this.t);
      this.mname = r.mname;
      this.shipDenno = r.ship;
      this.saleDenno = r.sale;
    } catch (e) {
      this.error = '確認できませんでした：' + (e as Error).message;
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  async changeMcode() {
    if (this.t) {
      this.t.mcode = this.t.mcode.trim();
      await this.load2();
    }
  }

  /** シートは読み直さずに確認だけし直す（受注先コードを直したとき） */
  private async load2() {
    if (!this.t) {
      return;
    }
    this.busy = true;
    try {
      const r = await this.srv.resolve(this.t);
      this.mname = r.mname;
      this.saleDenno = r.sale;
    } catch (e) {
      this.error = '確認できませんでした：' + (e as Error).message;
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  private storeName(): string {
    const s = this.stores.find(e => e.code == this.scode);
    return s ? s.code + ' ' + s.name : this.scode;
  }

  async ship() {
    const t = this.t;
    if (!t || !this.canShip) {
      return;
    }
    const warn = this.shipDenno ? '\n\n※この大会の出荷の移動伝票は登録済みです（伝票番号 ' + this.shipDenno + '）。' : '';
    if (!confirm('接続先：' + this.envName + '\n\n出荷の移動伝票を登録します。\n' + t.shipDay + '　' + HOME_SCODE + ' 朝来倉庫 → ' + this.storeName() +
      '\n準備数 ' + this.sum('prep') + '（' + t.items.filter(i => i.prep > 0).length + ' 品番）' + warn + '\n\nよろしいですか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    try {
      this.shipDenno = await this.srv.ship(t, this.scode);
      this.message = '出荷の移動伝票 ' + this.shipDenno + ' を登録しました';
    } catch (e) {
      this.error = '出荷の移動伝票を登録できませんでした：' + (e as Error).message;
      console.log('error frmtaikai ship', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  async sale() {
    const t = this.t;
    if (!t || !this.canSale) {
      return;
    }
    const warn = this.saleDenno ? '\n\n※この大会の売上の受注伝票は登録済みです（伝票番号 ' + this.saleDenno + '）。' : '';
    if (!confirm('接続先：' + this.envName + '\n\n' + this.saleDay + ' で次を登録します。\n' +
      '・受注伝票（' + t.mcode + ' ' + this.mname + '、' + this.storeName() + ' から出荷済）：売上数 ' + this.sum('sales') + '、' + this.amount.toLocaleString() + ' 円（税込）\n' +
      '・戻りの移動伝票（' + this.storeName() + ' → ' + HOME_SCODE + ' 朝来倉庫）：在庫数 ' + this.sum('stock') + warn + '\n\nよろしいですか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    try {
      const r = await this.srv.sale(t, this.scode, this.saleDay);
      this.saleDenno = r.jdenno ?? this.saleDenno;
      this.backDenno = r.mdenno;
      this.message = [r.jdenno ? '受注伝票 ' + r.jdenno : '', r.mdenno ? '戻りの移動伝票 ' + r.mdenno : ''].filter(e => e).join('・') + ' を登録しました';
    } catch (e) {
      this.error = '売上を登録できませんでした：' + (e as Error).message;
      console.log('error frmtaikai sale', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
