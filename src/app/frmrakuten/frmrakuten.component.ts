import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { parseCsv } from './../frmocnk/ocnk-parse';
import { RakutenService } from './rakuten.service';
import { RakutenOrder, RakutenConv, lineMoney, orderTotal, parseRakuten } from './rakuten-parse';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { DecimalPipe } from '@angular/common';
import { DenlinkComponent } from './../share/denlink/denlink.component';

/** 倉庫の初期値 */
const DEFAULT_SCODE = '01';

/**
 * 楽天受注の取込（現行の通販Pro の取込設定 175「楽天SSデータ」の置き換え）。
 * RMS の受注 CSV を読み込み、注文ごとに確認してから受注伝票に登録する。
 * 担当者は画面の上で、倉庫は明細ごとに選ぶ。注文者は電話番号で顧客マスタを探し、無ければ新規作成する。
 */
@Component({
  selector: 'app-frmrakuten',
  templateUrl: './frmrakuten.component.html',
  styleUrls: ['./../frmocnk/frmocnk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatToolbar, MatButton, MatIcon, MatFormField, MatLabel, MatSelect, MatOption, FormsModule, DecimalPipe, DenlinkComponent]
})
export class FrmrakutenComponent implements OnInit {
  private srv = inject(RakutenService);
  private usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  strsrv = inject(StoreService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  /** 担当者（受注伝票・新規の顧客の担当者） */
  tanto: string | null = null;
  fileName = '';
  orders: RakutenOrder[] = [];
  busy = false;
  error = '';
  message = '';
  progress = '';
  private open = new Set<string>();

  constructor() {
    this.title.setTitle('楽天受注取込(MWSystem)');
  }

  async ngOnInit() {
    this.strsrv.getStore();
    if (this.stfsrv.tcds.length == 0) {
      await this.stfsrv.getStaff();
    }
    const code = this.usrsrv.staff?.code ?? '';
    if (this.stfsrv.tcds.some(e => e.value == code)) {
      this.tanto = code;
    }
    this.cdRef.detectChanges();
  }

  get envName(): string {
    return localStorage.getItem('MWSYS_DB') != null ? 'テスト環境' : '本番環境';
  }

  get lineCount(): number {
    return this.orders.reduce((s, o) => s + o.lines.length, 0);
  }

  /** 明細の合計（税込）- CSV の請求金額 */
  diff(o: RakutenOrder): number {
    return o.err ? 0 : orderTotal(o) - o.seikyu;
  }

  get diffCount(): number {
    return this.orders.filter(o => this.diff(o) != 0).length;
  }

  get newCount(): number {
    return this.orders.filter(o => !o.denno && !o.mcode).length;
  }

  money(l: RakutenOrder['lines'][number]): number {
    return lineMoney(l).tin;
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
    this.orders = [];
    this.open.clear();
    this.cdRef.detectChanges();
    try {
      const mod = await import('encoding-japanese');
      const Encoding = (mod as unknown as { default?: typeof mod }).default ?? mod;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = Encoding.convert(bytes, { to: 'UNICODE', from: 'AUTO', type: 'string' }) as unknown as string;
      const conv: RakutenConv = {
        kana: s => Encoding.toHankanaCase(Encoding.toHankakuSpace(Encoding.toHankakuCase(Encoding.toKatakanaCase(s)))),
        wide: s => Encoding.toZenkanaCase(Encoding.toZenkakuSpace(Encoding.toZenkakuCase(s))),
        narrow: s => Encoding.toHankakuCase(s).replace(/[ー－―‐]/g, '-')
      };
      const orders = parseRakuten(parseCsv(text.replace(/^﻿/, '')), conv, DEFAULT_SCODE);
      if (orders.length == 0) {
        throw new Error('ファイルに注文がありません');
      }
      await this.srv.resolve(orders);
      this.orders = orders;
      this.fileName = file.name;
    } catch (e) {
      this.error = 'CSV を読み込めませんでした：' + (e as Error).message;
      console.log('error frmrakuten csv', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  isOpen(o: RakutenOrder): boolean {
    return this.open.has(o.cusden);
  }

  toggle(o: RakutenOrder) {
    if (this.open.has(o.cusden)) {
      this.open.delete(o.cusden);
    } else {
      this.open.add(o.cusden);
    }
  }

  private target(o: RakutenOrder): boolean {
    return !o.err && !o.result.startsWith('登録済') && !o.result.startsWith('スキップ');
  }

  get targetCount(): number {
    return this.orders.filter(o => this.target(o)).length;
  }

  async register() {
    const list = this.orders.filter(o => this.target(o));
    if (list.length == 0) {
      return;
    }
    if (!this.tanto) {
      this.error = '担当者を選んでください';
      return;
    }
    if (!confirm('接続先：' + this.envName + '\n\n楽天の受注 ' + list.length + ' 件を登録します。よろしいですか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    let ok = 0, skip = 0, ng = 0;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      this.progress = '登録中 ' + (i + 1) + ' / ' + list.length + '  注文番号 ' + o.cusden;
      this.cdRef.detectChanges();
      try {
        o.result = await this.srv.register(o, this.tanto);
        if (o.result.startsWith('登録済')) {
          ok++;
        } else {
          skip++;
        }
      } catch (e) {
        o.result = 'エラー：' + (e as Error).message;
        ng++;
        console.log('error frmrakuten register', o.cusden, e);
      }
    }
    this.progress = '';
    this.message = '登録 ' + ok + ' 件、スキップ ' + skip + ' 件、エラー ' + ng + ' 件';
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
