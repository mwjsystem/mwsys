import { Component, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, viewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { OpelogComponent, OpelogParam } from './../share/opelog/opelog.component';
import { EXTYPE_TANA, TanaGoods, TanaRec, TanaService } from './tana.service';

/**
 * 棚卸（単票。在庫関連 → 棚卸処理。現行の棚卸処理の画面の代わり）。
 * 倉庫・日付・商品を入れると、在庫数（その日の終わり）と棚番が出る。棚卸数を入れて OK で登録する（同じ日は上書き）。
 * 自動表示（棚番順・商品番号順）にすると、登録のあと次の商品へ進む
 */
@Component({
  selector: 'app-frmtana',
  templateUrl: './frmtana.component.html',
  styleUrls: ['./frmtana.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, RouterLink, MatToolbar, MatButton, MatIconButton, MatIcon, MatTooltip]
})
export class FrmtanaComponent {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  strsrv = inject(StoreService);
  private tanasrv = inject(TanaService);
  private dialog = inject(MatDialog);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly gcodeInput = viewChild<ElementRef<HTMLInputElement>>('gcodeInput');
  readonly tanaInput = viewChild<ElementRef<HTMLInputElement>>('tanaInput');

  scode = this.usrsrv.staff?.scode ?? '';
  day = this.usrsrv.formatDate(new Date());
  code = '';
  goods: TanaGoods | null = null;
  stock: number | null = null;
  rec: TanaRec | null = null;
  tana: number | null = null;
  memo = '';
  /** 自動表示: none = なし、tanano = 棚番号順、gcode = 商品番号順 */
  auto: 'none' | 'tanano' | 'gcode' = 'none';
  private list: TanaGoods[] = [];
  private listOrder = '';
  busy = false;
  message = '';

  constructor() {
    this.title.setTitle('棚卸処理(MWSystem)');
    this.strsrv.getStore();
    if (this.stfsrv.tcds.length == 0) {
      this.stfsrv.getStaff();
    }
  }

  storeName(code: string): string {
    return this.strsrv.scds.find(s => s.value == code)?.viewval ?? '';
  }

  /** 商品コード（または JAN）を入れたとき */
  async setCode(v: string) {
    this.code = String(v ?? '').trim();
    this.message = '';
    if (!this.code) {
      this.clear();
      return;
    }
    try {
      const g = await this.tanasrv.findGoods(this.code);
      if (!g) {
        this.clear(false);
        this.message = '商品コード ' + this.code + ' は登録されていません';
        this.cdRef.detectChanges();
        return;
      }
      await this.show(g);
    } catch (e) {
      this.message = '商品を読めませんでした：' + (e as Error).message;
    }
    this.cdRef.detectChanges();
  }

  /** 商品の在庫数・登録済みの棚卸を出し、棚卸数の欄へ進む */
  private async show(g: TanaGoods) {
    this.goods = g;
    this.code = g.gcode;
    this.stock = null;
    this.rec = null;
    this.tana = null;
    this.memo = '';
    if (!this.scode || !this.day) {
      this.message = '倉庫と日付を入れてください';
      return;
    }
    const [st, rc] = await Promise.all([
      this.tanasrv.stocks(this.scode, this.day, [g.gcode]),
      this.tanasrv.records(this.scode, this.day, [g.gcode])
    ]);
    this.stock = st.get(g.gcode) ?? 0;
    this.rec = rc.get(g.gcode) ?? null;
    if (this.rec) {
      this.tana = this.rec.tana;
      this.memo = this.rec.memo ?? '';
    }
    this.cdRef.detectChanges();
    setTimeout(() => this.tanaInput()?.nativeElement.select());
  }

  /** 倉庫・日付を変えたら、表示中の商品を読み直す */
  reload() {
    if (this.goods) {
      this.show(this.goods).catch(e => this.message = (e as Error).message);
    }
  }

  clear(all = true) {
    if (all) {
      this.code = '';
    }
    this.goods = null;
    this.stock = null;
    this.rec = null;
    this.tana = null;
    this.memo = '';
  }

  gcdHelp() {
    const cfg = new MatDialogConfig();
    cfg.width = '100vw';
    cfg.height = '98%';
    cfg.panelClass = 'full-screen-modal';
    cfg.data = { gcode: this.code, tkbn: ['0', '1'] };
    this.dialog.open(GcdhelpComponent, cfg).afterClosed().subscribe(data => {
      if (data?.gcode) {
        this.setCode(data.gcode);
      }
    });
  }

  get diff(): number | null {
    return this.tana == null || this.stock == null ? null : Number(this.tana) - this.stock;
  }

  /** OK: 棚卸を登録する（同じ日は上書き）。自動表示なら次の商品へ */
  async ok() {
    if (!this.goods || !this.scode || !this.day) {
      return;
    }
    const n = Number(this.tana);
    if (this.tana == null || String(this.tana) === '' || !Number.isInteger(n) || n < 0) {
      this.message = '棚卸数は 0 以上の整数で入れてください';
      return;
    }
    this.busy = true;
    this.message = '';
    this.cdRef.detectChanges();
    try {
      await this.tanasrv.saveTana(this.scode, this.day, [{ gcode: this.goods.gcode, tana: n, memo: this.memo }]);
      this.usrsrv.toastSuc(this.goods.gcode + ' の棚卸を ' + n + ' で登録しました' + (this.diff ? '（在庫との差 ' + (this.diff > 0 ? '+' : '') + this.diff + '）' : ''));
      if (this.auto != 'none') {
        await this.next();
      } else {
        this.clear();
        setTimeout(() => this.gcodeInput()?.nativeElement.focus());
      }
    } catch (e) {
      this.message = '登録できませんでした：' + (e as Error).message;
      console.log('error save tana', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 自動表示: 棚番順・商品番号順で次の商品を出す */
  async next() {
    if (this.auto == 'none') {
      return;
    }
    if (this.listOrder != this.auto) {
      this.list = await this.tanasrv.goodsList(this.auto);
      this.listOrder = this.auto;
    }
    const i = this.goods ? this.list.findIndex(g => g.gcode == this.goods!.gcode) : -1;
    const g = this.list[i + 1];
    if (!g) {
      this.clear();
      this.message = '最後の商品です';
      return;
    }
    await this.show(g);
  }

  cancel() {
    this.clear();
    this.message = '';
    setTimeout(() => this.gcodeInput()?.nativeElement.focus());
  }

  opelog() {
    if (!this.goods) {
      return;
    }
    const data: OpelogParam = { extype: EXTYPE_TANA, keycode: this.goods.gcode, title: '棚卸 ' + this.goods.gcode, table: 'trgtana' };
    this.dialog.open(OpelogComponent, { width: '900px', maxWidth: '95vw', data });
  }
}
