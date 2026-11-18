import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { DecimalPipe, PercentPipe } from '@angular/common';
import * as FileSaver from 'file-saver';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { loadExcelJs, excelBuffer } from './../services/busy.service';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { TANKA_KEYS, TankaKey } from './../mstgoods/goods-const';
import { KakeMember, PriceService } from './price.service';
import { KakeRow, buildKake, writeKake } from './kake';

/** 印刷用の 3 種類（id=1: tanka2 道場価格・tanka3 代理店価格・tanka7 FC価格）の見出しの初期値 */
const TITLES: Partial<Record<TankaKey, string>> = {
  tanka2: '会員様向け 卸価格表一覧まとめ', tanka3: '法人様向け 卸価格一覧表まとめ', tanka7: 'FC様向け 卸価格一覧表まとめ'
};

/**
 * 掛率表（各マスタ → 掛率表）。基準日の単価で、単価区分（道場・代理店・FC など）ごとの卸価格と掛率の表を Excel に出す。
 * 顧客コードを指定したときは、その顧客の単価区分の卸価格を出し、特別単価のある商品は特別単価に置き換えて印を付ける
 */
@Component({
  selector: 'app-kakehyo',
  templateUrl: './kakehyo.component.html',
  styleUrls: ['./mstprice.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, RouterLink, MatToolbar, MatButton, MatIconButton, MatIcon, MatTooltip, DecimalPipe, PercentPipe]
})
export class KakehyoComponent {
  usrsrv = inject(UserService);
  private bunsrv = inject(BunruiService);
  private prcsrv = inject(PriceService);
  private dialog = inject(MatDialog);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  day = this.usrsrv.formatDate(new Date());
  /** 'kbn' = 単価区分を選ぶ、'member' = 顧客を指定 */
  target: 'kbn' | 'member' = 'kbn';
  key: TankaKey = 'tanka2';
  mcode = '';
  member: KakeMember | null = null;
  merge = true;
  paged = true;
  noEnd = true;
  onlySpecial = false;
  head = '';
  sub = '';
  notes = '・基本送料は1個口につき、本州・四国・九州…880円 / 北海道・沖縄 1,650円 / その他離島はお問い合わせください。\n※価格はすべて税込みです。';
  rows: KakeRow[] = [];
  busy = false;
  error = '';
  message = '';

  constructor() {
    this.title.setTitle('掛率表(MWSystem)');
    this.bunsrv.qryBunrui().then(() => this.cdRef.detectChanges()).catch(() => undefined);
    this.setHead();
  }

  tankaName(k: string): string {
    const sys = this.usrsrv.system as unknown as Record<string, string> | undefined;
    return String(sys?.['tnk' + k.slice(5) + 'txt'] ?? k);
  }

  /** 選べる単価区分（通販定価と「不使用」・原価は除く） */
  get kinds(): TankaKey[] {
    return TANKA_KEYS.filter(k => k != 'tanka1' && !/不使用|原価/.test(this.tankaName(k)));
  }

  spName(v: string): string {
    return this.bunsrv.kbn['sptnkbn']?.find(s => s.value == v)?.viewval ?? '';
  }

  /** 顧客の単価区分（tankakbn 1〜9 → tanka1〜9） */
  private get memberKey(): TankaKey | null {
    const n = Number(this.member?.tankakbn);
    return n >= 1 && n <= 9 ? TANKA_KEYS[n - 1] : null;
  }

  get useKey(): TankaKey | null {
    return this.target == 'member' ? this.memberKey : this.key;
  }

  /** 見出しの初期値 */
  setHead() {
    if (this.target == 'member' && this.member) {
      this.head = this.member.name + ' 様 卸価格表';
    } else {
      this.head = TITLES[this.key] ?? (this.tankaName(this.key) + ' 卸価格表');
    }
    const d = new Date(this.day + 'T00:00:00');
    this.sub = isNaN(d.getTime()) ? '' : d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 現在';
    this.rows = [];
  }

  mcdHelp() {
    const cfg = new MatDialogConfig();
    cfg.width = '100vw';
    cfg.height = '98%';
    cfg.panelClass = 'full-screen-modal';
    this.dialog.open(McdhelpComponent, cfg).afterClosed().subscribe(data => {
      if (data?.mcode) {
        this.mcode = data.mcode;
        this.findMember();
      }
    });
  }

  async findMember() {
    this.member = null;
    this.rows = [];
    this.error = '';
    const m = this.mcode.trim();
    if (!m) {
      return;
    }
    try {
      this.member = await this.prcsrv.member(m);
      if (!this.member) {
        this.error = '顧客コード ' + m + ' は登録されていません';
      } else if (!this.memberKey) {
        this.error = 'この顧客は単価区分が入っていません';
      }
      this.setHead();
    } catch (e) {
      this.error = '顧客を読めませんでした：' + (e as Error).message;
    }
    this.cdRef.detectChanges();
  }

  /** 表を作る（画面に出し、Excel に出せるようにする） */
  async make() {
    const key = this.useKey;
    if (!key) {
      this.error = this.target == 'member' ? '顧客を指定してください' : '単価区分を選んでください';
      return;
    }
    if (!this.day) {
      this.error = '基準日を入れてください';
      return;
    }
    this.busy = true;
    this.error = '';
    this.message = '';
    this.cdRef.detectChanges();
    try {
      const sp = this.target == 'member' ? this.member?.sptnkbn ?? '' : '';
      const goods = await this.prcsrv.kakeGoods(this.day, sp, this.paged, this.noEnd);
      this.rows = buildKake(goods, { key, merge: this.merge, onlySpecial: this.target == 'member' && this.onlySpecial });
      const sps = this.rows.filter(r => r.special).length;
      this.message = goods.length + ' 商品から ' + this.rows.length + ' 行の表を作りました' + (sp ? '（特別単価 ' + sps + ' 行）' : '');
      if (this.rows.length == 0 && this.paged) {
        this.message += '。頁の入った商品グループがありません（価格改定取込で頁を入れるか、「頁のある商品だけ」を外してください）';
      }
    } catch (e) {
      this.error = '表を作れませんでした：' + (e as Error).message;
      console.log('error kakehyo', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  get priceLabel(): string {
    const key = this.useKey;
    return this.target == 'member' ? '卸価格（税込）' : (key ? this.tankaName(key) : '卸価格') + '（税込）';
  }

  async exportExcel() {
    if (this.rows.length == 0) {
      return;
    }
    try {
      const lib = await loadExcelJs();
      const Workbook = lib.Workbook ?? lib.default.Workbook;
      const wb = new Workbook();
      const name = (this.target == 'member' ? '顧客' + this.member?.mcode : this.tankaName(this.key)).replace(/[\\/:*?"<>|[\]]/g, '');
      const ws = wb.addWorksheet(('掛率表_' + name).slice(0, 31));
      const notes = this.notes.split('\n').map(s => s.trim()).filter(s => s);
      if (this.rows.some(r => r.special)) {
        notes.push('※黄色の行は特別単価です。');
      }
      writeKake(ws as never, this.rows, { title: this.head, sub: this.sub, notes, priceLabel: this.priceLabel }, this.merge);
      const buf = await excelBuffer(wb);
      FileSaver.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        '掛率表_' + name + '_' + this.day.replace(/-/g, '') + '.xlsx');
    } catch (e) {
      this.error = 'Excel を作れませんでした：' + (e as Error).message;
      console.log('error kakehyo excel', e);
    }
    this.cdRef.detectChanges();
  }
}
