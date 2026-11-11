import { Component, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { DecimalPipe } from '@angular/common';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { ClosedayService } from './../services/closeday.service';
import { VendsService } from './../mstvendor/vends.service';
import { HatmeiService } from './../frmsupply/hatmei.service';
import { HdnohelpComponent } from './../share/hdnohelp/hdnohelp.component';
import { HatHead, OpenLine, SiidenNew, SiimeiInput, SiimeiService, SiiZaiko } from './siimei.service';

/** 1 行（発注明細と、入荷する数） */
interface BulkLine extends OpenLine { on: boolean; recv: number }
/** 発注伝票ごとのまとまり */
interface BulkGroup { head: HatHead; lines: BulkLine[] }

/**
 * 仕入の一括登録（仕入関連 → 仕入一括登録）。発注番号を指定して（複数可。仕入先・入荷予定日で探すこともできる）、
 * 発注残のある明細を出し、入荷する数を確かめて、発注伝票ごとに仕入伝票を作る。
 * 在庫の入荷数を足し、発注明細の入荷済の印と発注伝票の状況を直す。操作ログに残る
 */
@Component({
  selector: 'app-siibulk',
  templateUrl: './siibulk.component.html',
  styleUrls: ['./siibulk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, RouterLink, MatToolbar, MatButton, MatIconButton, MatIcon, MatTooltip, DecimalPipe]
})
export class SiibulkComponent implements AfterViewInit {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  strsrv = inject(StoreService);
  private closesrv = inject(ClosedayService);
  private vensrv = inject(VendsService);
  private hmisrv = inject(HatmeiService);
  private smisrv = inject(SiimeiService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  /** 発注番号（空白・カンマ・改行で区切って複数） */
  dnosText = '';
  vcode = '';
  ydayTo = '';
  inday = this.usrsrv.formatDate(new Date());
  tcode = this.usrsrv.staff?.code ?? '';
  groups: BulkGroup[] = [];
  made: { denno: number; hdenno: number }[] = [];
  busy = false;
  message = '';
  error = '';

  constructor() {
    this.title.setTitle('仕入一括登録(MWSystem)');
    this.strsrv.getStore();
    this.closesrv.load();
    this.vensrv.getVendors().then(() => this.cdRef.detectChanges());
    if (this.stfsrv.tcds.length == 0) {
      this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    }
  }

  ngAfterViewInit(): void {
    const h = this.route.snapshot.queryParamMap.get('hdenno');
    if (h) {
      this.dnosText = h;
      this.load();
    }
  }

  vname(v: string): string {
    return this.vensrv.getVcdtxt(v);
  }

  storeName(c: string): string {
    return this.strsrv.scds.find(s => s.value == c)?.viewval ?? c;
  }

  private get dnos(): number[] {
    return [...new Set(this.dnosText.split(/[\s,、]+/).map(s => Number(s.trim())).filter(n => n > 0))];
  }

  get checkedLines(): BulkLine[] {
    return this.groups.flatMap(g => g.lines.filter(l => l.on && Number(l.recv) > 0));
  }

  get checkedGroups(): BulkGroup[] {
    return this.groups.filter(g => g.lines.some(l => l.on && Number(l.recv) > 0));
  }

  money(l: BulkLine): number {
    return Math.round(Number(l.genka) * Number(l.recv) * 100) / 100;
  }

  groupTotal(g: BulkGroup): { gtotal: number; tax: number } {
    let gtotal = 0;
    let tax = 0;
    for (const l of g.lines.filter(e => e.on && Number(e.recv) > 0)) {
      const m = this.money(l);
      gtotal += m;
      if (l.mtax == '0') {
        tax += m * Number(l.taxrate ?? 0) / 100;
      }
    }
    return { gtotal, tax: Math.floor(tax) };
  }

  hdennoHelp() {
    const cfg = new MatDialogConfig();
    cfg.width = '100vw';
    cfg.height = '98%';
    cfg.panelClass = 'full-screen-modal';
    this.dialog.open(HdnohelpComponent, cfg).afterClosed().subscribe(data => {
      if (data?.denno) {
        this.dnosText = [...this.dnos, Number(data.denno)].join(' ');
        this.load();
      }
    });
  }

  /** 仕入先・入荷予定日で、発注残のある発注伝票を探して足す */
  async find() {
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      const found = await this.smisrv.findOpen(this.vcode.trim(), this.ydayTo);
      if (found.length == 0) {
        this.message = '発注残のある発注伝票はありません';
      } else {
        this.dnosText = [...new Set([...this.dnos, ...found])].join(' ');
        await this.load();
        return;
      }
    } catch (e) {
      this.error = '探せませんでした：' + (e as Error).message;
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 指定した発注伝票の発注残を出す */
  async load() {
    const dnos = this.dnos;
    if (dnos.length == 0) {
      this.groups = [];
      return;
    }
    this.busy = true;
    this.error = '';
    this.message = '';
    this.made = [];
    this.cdRef.detectChanges();
    try {
      const { heads, lines } = await this.smisrv.openOrders(dnos);
      this.groups = heads.sort((a, b) => a.denno - b.denno).map(h => ({
        head: h,
        lines: lines.filter(l => l.denno == h.denno && l.hatzn > 0).map(l => ({ ...l, on: true, recv: l.hatzn }))
      }));
      const missing = dnos.filter(d => !heads.some(h => h.denno == d));
      const noOpen = this.groups.filter(g => g.lines.length == 0).map(g => g.head.denno);
      this.groups = this.groups.filter(g => g.lines.length > 0);
      const notes: string[] = [];
      if (missing.length) {
        notes.push('見つからない発注伝票：' + missing.join('・'));
      }
      if (noOpen.length) {
        notes.push('発注残の無い（入荷済の）発注伝票：' + noOpen.join('・'));
      }
      this.message = notes.join('　');
    } catch (e) {
      this.error = '読めませんでした：' + (e as Error).message;
      console.log('error siibulk load', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  setGroup(g: BulkGroup, on: boolean) {
    g.lines.forEach(l => l.on = on);
  }

  /** 発注伝票ごとに仕入伝票を作る */
  async create() {
    const groups = this.checkedGroups;
    if (groups.length == 0) {
      return;
    }
    if (!this.inday || !this.tcode) {
      this.error = '入荷日と担当者を入れてください';
      return;
    }
    if (this.closesrv.isClosed(this.inday)) {
      this.error = '入荷日が締め日（' + this.closesrv.closeday + '）以前です';
      return;
    }
    const over = this.checkedLines.filter(l => Number(l.recv) > l.hatzn);
    if (!confirm(groups.length + ' 枚の仕入伝票（' + this.checkedLines.length + ' 行）を、入荷日 ' + this.inday + ' で作ります。'
      + (over.length ? '\n発注残より多い行が ' + over.length + ' 行あります。' : '') + '\n在庫に入荷数を足します。よろしいですか？')) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      const last = Number(await this.usrsrv.getNumber('sdenno', groups.length));
      if (!last) {
        throw new Error('仕入伝票番号を採番できませんでした');
      }
      const first = last - groups.length + 1;
      const now = new Date();
      const by = this.usrsrv.staff?.code ?? '';
      const id = this.usrsrv.compid;
      const heads: SiidenNew[] = [];
      const meis: SiimeiInput[] = [];
      const zaiko: SiiZaiko[] = [];
      const made: { denno: number; hdenno: number }[] = [];
      groups.forEach((g, i) => {
        const denno = first + i;
        const t = this.groupTotal(g);
        const lines = g.lines.filter(l => l.on && Number(l.recv) > 0);
        heads.push({
          id, denno, vcode: g.head.vcode, scode: g.head.scode, tcode: this.tcode, inday: this.inday, currency: g.head.currency,
          dmemo: '発注伝票' + g.head.denno + 'から一括登録', gtotal: t.gtotal, tax: t.tax, total: t.gtotal + t.tax,
          created_at: now, created_by: by, updated_at: now, updated_by: by
        } as unknown as SiidenNew);
        lines.forEach((l, k) => meis.push({
          id, denno, line: k + 1, inday: this.inday, gcode: l.gcode, suu: Number(l.recv), genka: l.genka, money: this.money(l),
          taxrate: l.taxrate, mmemo: l.mmemo, spec: l.spec, hdenno: l.denno, hline: l.line, mtax: l.mtax
        } as unknown as SiimeiInput));
        zaiko.push(...this.smisrv.hnyuOf(g.head.scode, this.inday, lines.map(l => ({ gcode: l.gcode, suu: Number(l.recv) }))));
        made.push({ denno, hdenno: g.head.denno });
      });
      await this.smisrv.insSiiden(heads, meis, zaiko);
      // 発注明細の入荷済の印・発注伝票の状況
      try {
        await this.smisrv.refreshHatden(groups.map(g => g.head.denno), this.inday, m => this.hmisrv.getHdsta(m));
      } catch (e) {
        console.log('error refreshHatden', e);
        this.usrsrv.toastWar('仕入伝票は作りましたが、発注伝票の状況を直せませんでした（' + (e as Error).message + '）');
      }
      this.usrsrv.toastSuc(made.length + ' 枚の仕入伝票を作りました');
      await this.load();
      this.made = made;
      this.message = made.length + ' 枚の仕入伝票を作りました（' + made.map(m => m.denno).join('・') + '）';
    } catch (e) {
      this.error = '仕入伝票を作れませんでした：' + (e as Error).message;
      console.log('error siibulk create', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  open(func: string, dno: number) {
    this.usrsrv.openMst(func, String(dno));
  }
}
