import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import * as FileSaver from 'file-saver';
import { UserService } from './../services/user.service';
import { OcnkMaster, OcnkService } from './ocnk.service';
import { OcnkDojo, OcnkOrder, parseCsv, parseOrders } from './ocnk-parse';
import { fillOcnkBook } from './ocnk-excel';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatFormField, MatLabel } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { DecimalPipe } from '@angular/common';

/** おちゃのこの CSV で会員ID が入っている列 */
const COL_WEBID = 51;

/**
 * おちゃのこ受注の取込（現行の BTC-MWWEB.xlsm と member.xlsx の置き換え）。
 * CSV を読み込んで一覧で確認してから登録する。道場会員は顧客マスタの Web会員ID で探す。
 */
@Component({
  selector: 'app-frmocnk',
  templateUrl: './frmocnk.component.html',
  styleUrls: ['./frmocnk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatToolbar, MatButton, MatIcon, MatCheckbox, MatFormField, MatLabel, MatSelect, MatOption, FormsModule, DecimalPipe]
})
export class FrmocnkComponent implements OnInit {
  private srv = inject(OcnkService);
  private usrsrv = inject(UserService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  master?: OcnkMaster;
  /** CSV の会員ID → 顧客 */
  private dojo: Record<string, OcnkDojo> = {};
  /** 取り込む担当者（'' はすべて） */
  tanto = '';
  ippan = false;
  fileName = '';
  private rows: string[][] = [];
  orders: OcnkOrder[] = [];
  notFound: string[] = [];
  busy = false;
  error = '';
  message = '';
  progress = '';
  private open = new Set<string>();

  constructor() {
    this.title.setTitle('おちゃのこ受注取込(MWSystem)');
  }

  async ngOnInit() {
    try {
      this.master = await this.srv.master();
    } catch (e) {
      this.error = '変換表を読み込めませんでした：' + (e as Error).message;
      console.log('error frmocnk master', e);
    }
    this.cdRef.detectChanges();
  }

  /** 担当者の選択肢（読み込んだ CSV の道場会員の担当者） */
  get tantoList(): string[] {
    const set = new Set(Object.values(this.dojo).map(e => e.tcode ?? '').filter(e => e));
    set.add('3124');
    return [...set].sort();
  }

  get envName(): string {
    return localStorage.getItem('MWSYS_DB') != null ? 'テスト環境' : '本番環境';
  }

  get lineCount(): number {
    return this.orders.reduce((s, o) => s + o.lines.length, 0);
  }

  /** 明細の合計 - CSV の合計金額（マクロが解析しない刺繍の項目があると合わない） */
  diff(o: OcnkOrder): number {
    return o.err ? 0 : o.lines.reduce((s, l) => s + l.money, 0) - o.total;
  }

  get diffCount(): number {
    return this.orders.filter(o => this.diff(o) != 0).length;
  }

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.error = '';
    this.message = '';
    try {
      const mod = await import('encoding-japanese');
      const Encoding = (mod as unknown as { default?: typeof mod }).default ?? mod;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = Encoding.convert(bytes, { to: 'UNICODE', from: 'AUTO', type: 'string' }) as unknown as string;
      this.rows = parseCsv(text.replace(/^﻿/, ''));
      const webids = [...new Set(this.rows.slice(1).map(r => r[COL_WEBID] ?? '').filter(e => e))];
      this.dojo = await this.srv.dojo(webids);
      // 最初の読み込みでは、ログイン中の担当者を初期値にする
      const code = this.usrsrv.staff?.code ?? '';
      if (!this.fileName && this.tantoList.includes(code)) {
        this.tanto = code;
      }
      this.fileName = file.name;
      await this.parse();
    } catch (e) {
      this.error = 'CSV を読み込めませんでした：' + (e as Error).message;
      console.log('error frmocnk csv', e);
    }
    this.cdRef.detectChanges();
  }

  /** 読み込んだ CSV を、今の条件で受注にする */
  async parse() {
    if (!this.master || this.rows.length == 0) {
      return;
    }
    if (this.rows.length < 2) {
      this.error = 'ファイルにデータがありません';
      return;
    }
    const mod = await import('encoding-japanese');
    const Encoding = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const narrow = (s: string) => Encoding.toHankanaCase(Encoding.toHankakuSpace(Encoding.toHankakuCase(s)));
    const res = parseOrders(this.rows, { ...this.master, dojo: this.dojo, tanto: this.tanto, ippan: this.ippan, narrow });
    this.orders = res.orders;
    this.notFound = res.notFound;
    this.open.clear();
    this.cdRef.detectChanges();
  }

  isOpen(o: OcnkOrder): boolean {
    return this.open.has(o.cusden);
  }

  toggle(o: OcnkOrder) {
    if (this.open.has(o.cusden)) {
      this.open.delete(o.cusden);
    } else {
      this.open.add(o.cusden);
    }
  }

  /** 登録の対象か（登録済・スキップ・読み込みエラーは対象外） */
  private target(o: OcnkOrder): boolean {
    return !o.err && !o.result.startsWith('登録済') && !o.result.startsWith('スキップ');
  }

  get targetCount(): number {
    return this.orders.filter(o => this.target(o)).length;
  }

  async register() {
    const list = this.orders.filter(o => this.target(o));
    if (list.length == 0 || !confirm('接続先：' + this.envName + '\n\n受注 ' + list.length + ' 件を登録します。よろしいですか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    let ok = 0;
    let skip = 0;
    let ng = 0;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      this.progress = '登録中 ' + (i + 1) + ' / ' + list.length + '  注文番号 ' + o.cusden;
      this.cdRef.detectChanges();
      try {
        o.result = await this.srv.register(o);
        if (o.result.startsWith('登録済')) {
          ok++;
        } else {
          skip++;
        }
      } catch (e) {
        o.result = 'エラー：' + (e as Error).message;
        ng++;
        console.log('error frmocnk register', o.cusden, e);
      }
    }
    this.progress = '';
    this.message = '登録 ' + ok + ' 件、スキップ ' + skip + ' 件、エラー ' + ng + ' 件';
    this.busy = false;
    this.cdRef.detectChanges();
  }

  async excel() {
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      // ExcelJS は大きいので、押されたときに読み込む
      const lib = await import('exceljs');
      const Workbook = lib.Workbook ?? lib.default.Workbook;
      const wb = new Workbook();
      fillOcnkBook(wb, this.orders);
      const buf = await wb.xlsx.writeBuffer();
      const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      FileSaver.saveAs(new Blob([buf], { type }), 'おちゃのこ受注取込.xlsx');
    } catch (e) {
      this.error = 'Excel を作成できませんでした：' + (e as Error).message;
      console.log('error frmocnk excel', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
