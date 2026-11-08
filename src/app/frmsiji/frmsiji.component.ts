import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { UserService } from './../services/user.service';
import { SijiLine, SijiCount, sijiCells, sijiCount, sijiFill, sijiOf, sijiSheets, sijiStartRow } from './siji';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { JdnohelpComponent } from './../share/jdnohelp/jdnohelp.component';
import { MatIcon } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import { DenlinkComponent } from './../share/denlink/denlink.component';

/** 読み込んだ指示書の Excel（画面を開き直しても選び直さなくてよいよう、ページの中で覚えておく） */
let template: { name: string; buf: ArrayBuffer; sheets: { name: string; path: string; start: number }[] } | null = null;

/**
 * 帯刺繍指示書（現行の set_siji.xlsm の置き換え）。受注伝票の帯の明細の本数を、指示書の Excel の選んだシートにセットしてダウンロードする。
 * 指示書の Excel（帯刺繍指示書.xlsx）は画面で選ぶ（図形を壊さないよう、シートの XML のセルだけを書き換える）
 */
@Component({
  selector: 'app-frmsiji',
  templateUrl: './frmsiji.component.html',
  styleUrls: ['./../frmocnk/frmocnk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatToolbar, MatButton, MatIconButton, MatIcon, FormsModule, DecimalPipe, DenlinkComponent]
})
export class FrmsijiComponent implements OnInit {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);

  denno: number | null = null;
  /** 読み込んだ伝票 */
  loaded: number | null = null;
  customer = '';
  staff = '';
  lines: SijiLine[] = [];
  sheet = '';
  busy = false;
  error = '';
  message = '';
  readonly sizes = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '00'];

  constructor() {
    this.title.setTitle('刺繍指示書(MWSystem)');
  }

  ngOnInit() {
    this.route.paramMap.subscribe(p => {
      const d = Number(p.get('denno'));
      if (d > 0) {
        this.denno = d;
        this.load();
      }
    });
  }

  get envName(): string {
    return localStorage.getItem('MWSYS_DB') != null ? 'テスト環境' : '本番環境';
  }

  get tmpl() {
    return template;
  }

  get count(): SijiCount {
    return sijiCount(this.lines);
  }

  get countRows(): [string, number[]][] {
    return [...this.count].filter(([, a]) => a.some(n => n > 0));
  }

  get total(): number {
    return this.countRows.reduce((s, [, a]) => s + a.reduce((x, n) => x + n, 0), 0);
  }

  sizeIdx(s: string): number {
    return s == '00' ? 9 : Number(s);
  }

  colorOf(l: SijiLine): string {
    const m = sijiOf(l.gcode);
    return m ? (/-KS$/.test(l.gcode.trim()) ? 'ﾚｯﾄﾞ・青' : m.color.replace(/\n/g, '')) + ' ' + m.size + '号' : '';
  }

  /** 受注伝票の検索（受注伝票画面と同じ検索の画面）。選んだ伝票を読む */
  dennoHelp() {
    const cfg = new MatDialogConfig();
    cfg.width = '100vw';
    cfg.height = '98%';
    cfg.panelClass = 'full-screen-modal';
    this.dialog.open(JdnohelpComponent, cfg).afterClosed().subscribe(data => {
      if (data?.denno) {
        this.denno = Number(data.denno);
        this.load();
      }
    });
  }

  setAll(v: boolean) {
    this.lines.filter(l => l.target).forEach(l => l.chk = v);
  }

  /** 受注伝票の明細を読む（帯の明細はすべてチェックしておく） */
  async load() {
    const dno = Number(this.denno);
    if (!dno) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.message = '';
    this.cdRef.detectChanges();
    try {
      const Get = gql`
        query get_siji($id: smallint!, $dno: Int!) {
          trjyuden(where: {id: {_eq: $id}, denno: {_eq: $dno}}) { denno mcode tcode msmember { sei mei } }
          trjyumei(where: {id: {_eq: $id}, denno: {_eq: $dno}, _or: [{del: {_is_null: true}}, {del: {_eq: false}}]}, order_by: {line: asc}) { line gcode suu mmemo }
          msstaff(where: {id: {_eq: $id}}) { code sei }
        }`;
      const res = await firstValueFrom(this.apollo.query<{
        trjyuden: { denno: number; mcode: string; tcode: string | null; msmember: { sei: string | null; mei: string | null } | null }[];
        trjyumei: { line: number; gcode: string; suu: number; mmemo: string | null }[];
        msstaff: { code: string; sei: string | null }[];
      }>({ query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dno } }));
      if (res.error || !res.data) {
        throw new Error(res.error?.message ?? '読めませんでした');
      }
      const j = res.data.trjyuden[0];
      if (!j) {
        throw new Error('受注伝票 ' + dno + ' がありません');
      }
      this.loaded = dno;
      this.customer = ((j.msmember?.sei ?? '') + (j.msmember?.mei ?? '')).trim() || j.mcode;
      // 担当者は姓だけ（現行と同じく、空白の前まで）
      this.staff = (res.data.msstaff.find(e => e.code == j.tcode)?.sei ?? '').split(/[\s　]/)[0];
      this.lines = res.data.trjyumei.map(l => {
        const target = !!sijiOf(l.gcode ?? '');
        return { line: l.line, gcode: (l.gcode ?? '').trim(), suu: Number(l.suu ?? 0), mmemo: l.mmemo, target, chk: target };
      });
      if (!this.lines.some(l => l.target)) {
        this.message = 'この伝票には、指示書に載せる帯の明細がありません';
      }
    } catch (e) {
      this.error = '受注伝票を読めませんでした：' + (e as Error).message;
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 指示書の Excel を選ぶ（指示書のシート = 色の表のあるシートを一覧にする） */
  async onTemplate(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      const buf = await file.arrayBuffer();
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(buf);
      const sheets: { name: string; path: string; start: number }[] = [];
      for (const s of await sijiSheets(zip)) {
        if (s.state != 'visible' || !zip.file(s.path)) {
          continue;
        }
        const start = await sijiStartRow(zip, s.path);
        if (start != null) {
          sheets.push({ name: s.name, path: s.path, start });
        }
      }
      if (sheets.length == 0) {
        throw new Error('指示書のシート（18〜29 行の D 列に「橙」の行があるシート）がありません');
      }
      template = { name: file.name, buf, sheets };
      if (!sheets.some(s => s.name == this.sheet)) {
        this.sheet = sheets[0].name;
      }
    } catch (e) {
      this.error = '指示書の Excel を読めませんでした：' + (e as Error).message;
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  get canMake(): boolean {
    return !!template && !!this.loaded && !!this.sheet && this.total > 0 && !this.busy;
  }

  /** 選んだシートに本数をセットした指示書をダウンロードする（ほかのシートは非表示） */
  async make() {
    const t = template;
    const s = t?.sheets.find(e => e.name == this.sheet);
    if (!t || !s || !this.loaded) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      const cells = sijiCells(this.count, s.start, { denno: this.loaded, staff: this.staff, customer: this.customer });
      const blob = await sijiFill(t.buf, s.path, cells);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '刺繍指示書_' + this.loaded + '_' + this.sheet.replace(/[\\/:*?"<>|\s]/g, '') + '.xlsx';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      this.message = '「' + this.sheet + '」に ' + this.total + ' 本をセットした指示書をダウンロードしました';
    } catch (e) {
      this.error = '指示書を作れませんでした：' + (e as Error).message;
      console.log('error frmsiji make', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
