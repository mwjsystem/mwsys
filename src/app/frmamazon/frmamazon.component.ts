import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { UserService } from './../services/user.service';
import { StoreService } from './../services/store.service';
import { parseCsv } from './../frmocnk/ocnk-parse';
import { AmazonService } from './amazon.service';
import { AmzLine, AmzOrder, lineMoney, parseAmazon } from './amazon-parse';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import { DenlinkComponent } from './../share/denlink/denlink.component';

/**
 * Amazon 受注の取込（現行の amazon受注テキスト変換.xlsm の置き換え）。
 * ベンダーセントラルの EditLineItems.csv を読み込み、PO ごとに確認してから受注伝票に登録する。
 */
@Component({
  selector: 'app-frmamazon',
  templateUrl: './frmamazon.component.html',
  styleUrls: ['./../frmocnk/frmocnk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatToolbar, MatButton, MatIcon, FormsModule, DecimalPipe, DenlinkComponent]
})
export class FrmamazonComponent implements OnInit {
  private srv = inject(AmazonService);
  private usrsrv = inject(UserService);
  strsrv = inject(StoreService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  fileName = '';
  orders: AmzOrder[] = [];
  busy = false;
  error = '';
  message = '';
  progress = '';
  private open = new Set<string>();
  private today = '';

  constructor() {
    this.title.setTitle('Amazon受注取込(MWSystem)');
  }

  ngOnInit() {
    this.strsrv.getStore();
  }

  get envName(): string {
    return localStorage.getItem('MWSYS_DB') != null ? 'テスト環境' : '本番環境';
  }

  get lineCount(): number {
    return this.orders.reduce((s, o) => s + o.lines.length, 0);
  }

  /** 明細の税抜合計 */
  amount(o: AmzOrder): number {
    return o.lines.reduce((s, l) => s + lineMoney(l.price, l.qty, l.taxrate).money, 0);
  }

  /** 仕入価格が代理店単価と違うか */
  priceDiff(l: AmzLine): boolean {
    return !!l.gcode && l.tanka3 != null && l.tanka3 != l.price;
  }

  diffCount(o: AmzOrder): number {
    return o.lines.filter(l => this.priceDiff(l)).length;
  }

  get diffOrders(): number {
    return this.orders.filter(o => this.diffCount(o) > 0).length;
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
      const orders = parseAmazon(parseCsv(text.replace(/^﻿/, '')));
      if (orders.length == 0) {
        throw new Error('ファイルに注文がありません');
      }
      this.today = this.usrsrv.formatDate(new Date());
      await this.srv.resolve(orders, this.today);
      this.orders = orders;
      this.fileName = file.name;
    } catch (e) {
      this.error = 'CSV を読み込めませんでした：' + (e as Error).message;
      console.log('error frmamazon csv', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  isOpen(o: AmzOrder): boolean {
    return this.open.has(o.po);
  }

  toggle(o: AmzOrder) {
    if (this.open.has(o.po)) {
      this.open.delete(o.po);
    } else {
      this.open.add(o.po);
    }
  }

  private target(o: AmzOrder): boolean {
    return !o.err && !o.result.startsWith('登録済') && !o.result.startsWith('スキップ');
  }

  get targetCount(): number {
    return this.orders.filter(o => this.target(o)).length;
  }

  async register() {
    const list = this.orders.filter(o => this.target(o));
    if (list.length == 0 || !confirm('接続先：' + this.envName + '\n\nAmazon の受注 ' + list.length + ' 件を登録します。よろしいですか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    let ok = 0, skip = 0, ng = 0;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      this.progress = '登録中 ' + (i + 1) + ' / ' + list.length + '  PO ' + o.po;
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
        console.log('error frmamazon register', o.po, e);
      }
    }
    this.progress = '';
    this.message = '登録 ' + ok + ' 件、スキップ ' + skip + ' 件、エラー ' + ng + ' 件';
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
