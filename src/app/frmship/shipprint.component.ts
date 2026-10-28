import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { ShipService } from './ship.service';
import { JDST } from './ship-forms';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { NasService } from './../services/nas.service';
import { NAS_SHIP } from './../share/nasfolder/nasfolder.component';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField, MatLabel, MatInput, MatSuffix } from '@angular/material/input';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';

/** NAS の出荷指示フォルダ 1 つ */
export interface PrintFolder {
  /** 担当者のフォルダ名（○○担当分） */
  staff: string;
  /** フォルダ名 */
  name: string;
  /** NAS の保存先からの相対パス（'/' 区切り） */
  path: string;
  denno: number;
  /** 倉庫で出力済（フォルダ名に「済」） */
  done: boolean;
  /** 同じ伝票の新しいフォルダがあり、印刷しない古いフォルダ（印刷時に「【自動済」を付ける） */
  old: boolean;
  files: string[];
  /** zmemo.txt などの倉庫への注意 */
  memo: string;
  /** 受注伝票の状態 */
  jdstatus: string | null;
  /** 受注伝票に記録した出荷指示フォルダと違う（受注伝票を直したあとの古いフォルダなど） */
  mismatch: boolean;
  chk: boolean;
}

/**
 * 出荷指示の印刷（朝来倉庫）。現行の「【朝来倉庫使用】一括印刷.xlsm」の置き換え。
 * NAS の {出荷日}出荷分 フォルダの出荷指示フォルダを一覧にし、チェックしたフォルダを印刷用スクリプト（mwjprint:）で印刷する。
 * 印刷を指示したときに、受注ステータスを「出荷指示出力済」にする。
 * 実際の印刷（Acrobat でプリンタを指定）・送り状 CSV のコピー・フォルダ名への「【済」付けはスクリプトが行う
 * （設定メニュー「初期設定⑤（出荷指示の印刷）」で、倉庫の PC に一度登録する）。
 */
@Component({
  selector: 'app-shipprint',
  templateUrl: './shipprint.component.html',
  styleUrls: ['./../app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbar, MatButton, MatIcon, MatTooltip, MatFormField, MatLabel, MatInput, MatSuffix, FormsModule, MatCard, MatCardContent, MatCheckbox, MatDatepickerInput, MatDatepickerToggle, MatDatepicker]
})
export class ShipprintComponent implements OnInit, OnDestroy {
  usrsrv = inject(UserService);
  nassrv = inject(NasService);
  private bunsrv = inject(BunruiService);
  private shipsrv = inject(ShipService);
  private apollo = inject(Apollo);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  day: Date = new Date();
  folders: PrintFolder[] = [];
  /** 表示中の日付フォルダ名 */
  dateDir = '';
  /** 画面で選んでいる保存先（NAS）のフォルダ名。印刷用スクリプトの設定と同じフォルダかを確かめるために渡す */
  rootName = '';
  /** 出力済（済）のフォルダも選べるようにする（再出力） */
  reprint = false;
  busy = false;
  message = '';
  /** 印刷後の読み直しのタイマー */
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    this.title.setTitle('出荷指示 印刷(MWSystem)');
  }

  ngOnInit(): void {
    this.bunsrv.qryBunrui().then(() => this.cdRef.detectChanges());
  }

  get staffs(): string[] {
    return [...new Set(this.folders.map(e => e.staff))];
  }

  inStaff(staff: string): PrintFolder[] {
    return this.folders.filter(e => e.staff == staff);
  }

  get selFolders(): PrintFolder[] {
    return this.folders.filter(e => e.chk && this.selectable(e));
  }

  selectable(f: PrintFolder): boolean {
    return !f.old && f.files.length > 0 && (!f.done || this.reprint);
  }

  hasCsv(f: PrintFolder): boolean {
    return f.files.some(e => e.toLowerCase().endsWith('.csv'));
  }

  statusName(value: string | null): string {
    return this.bunsrv.kbn['jdstatus']?.find(e => e.value == value)?.viewval ?? value ?? '';
  }

  /** フォルダ一覧表示（reset = false は印刷後の読み直しで、メッセージとチェックを残す） */
  async list(reset = true) {
    if (reset) {
      clearInterval(this.timer);
    }
    const checked = reset ? [] : this.folders.filter(e => e.chk).map(e => e.path);
    this.busy = true;
    if (reset) {
      this.message = '';
    }
    this.folders = [];
    this.cdRef.detectChanges();
    try {
      const root = await this.nassrv.open(NAS_SHIP);
      this.rootName = root.name;
      this.dateDir = this.usrsrv.formatDate(this.day).replace(/-/g, '') + '出荷分';
      const dateDir = await this.nassrv.find(root, this.dateDir);
      if (!dateDir) {
        this.message = this.dateDir + ' のフォルダがありません（出荷指示フォルダがまだ作成されていません）';
      } else {
        for (const staff of (await this.nassrv.names(dateDir, 'directory')).filter(e => e.endsWith('担当分'))) {
          const sdir = await this.nassrv.find(dateDir, staff);
          if (!sdir) {
            continue;
          }
          const names = await this.nassrv.names(sdir, 'directory');
          for (const name of names) {
            const dir = await this.nassrv.find(sdir, name);
            const files = dir ? await this.nassrv.names(dir, 'file') : [];
            let memo = '';
            for (const txt of files.filter(e => /\.txt$/i.test(e) && e != 'Manu.txt')) {
              const file = dir ? await this.nassrv.read(dir, txt) : undefined;
              if (file) {
                memo += new TextDecoder('shift_jis').decode(await file.arrayBuffer()).trim() + ' ';
              }
            }
            const denno = Number(name.split('_')[0]) || 0;
            const done = /済$/.test(name);
            this.folders.push({
              staff, name, path: this.dateDir + '/' + staff + '/' + name, denno, done, old: false,
              files, memo: memo.trim(), jdstatus: null, mismatch: false, chk: false
            });
          }
        }
        this.markOld();
        await this.loadStatus();
        await this.reflectPrinted();
        // 未出力で印刷できるフォルダを初めからチェックする（読み直しのときは、チェックしていたものだけ）
        this.folders.forEach(e => e.chk = (reset || checked.includes(e.path)) && !e.done && this.selectable(e));
        if (this.folders.length == 0) {
          this.message = this.dateDir + ' に出荷指示フォルダがありません';
        }
      }
    } catch (e) {
      this.message = 'フォルダを読めませんでした：' + (e as Error).message;
      console.log('error shipprint list', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 同じ担当者・同じ伝票で未出力のフォルダが複数あるときは、名前の最後（最新）以外を古いフォルダにする（現行マクロと同じ） */
  private markOld() {
    const groups = new Map<string, PrintFolder[]>();
    for (const f of this.folders.filter(e => !e.done)) {
      const key = f.staff + '/' + f.denno;
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }
    for (const fs of groups.values()) {
      fs.sort((a, b) => a.name.localeCompare(b.name)).slice(0, -1).forEach(e => e.old = true);
    }
  }

  /** 受注伝票の状態と、記録した出荷指示フォルダ */
  private async loadStatus() {
    const dennos = [...new Set(this.folders.map(e => e.denno).filter(e => e > 0))];
    if (dennos.length == 0) {
      return;
    }
    const Get = gql`
      query get_printsts($id: smallint!, $dnos: [Int!]!) {
        trjyuden(where: {id: {_eq: $id}, denno: {_in: $dnos}}) { denno jdstatus shipdir }
      }`;
    const { data } = await firstValueFrom(this.apollo.query<{ trjyuden: { denno: number; jdstatus: string | null; shipdir: string | null }[] }>({
      query: Get, fetchPolicy: 'network-only', variables: { id: this.usrsrv.compid, dnos: dennos }
    }));
    for (const f of this.folders) {
      const j = data?.trjyuden.find(e => e.denno == f.denno);
      f.jdstatus = j?.jdstatus ?? null;
      // 倉庫で「【済」などを付けたフォルダ名も同じフォルダとみなす
      f.mismatch = !!j?.shipdir && !f.old && !f.path.startsWith(j.shipdir);
    }
  }

  /**
   * 印刷用スクリプトが「【済」を付けたフォルダ（＝エラーなく複合機へ送れた）の伝票を、出荷指示出力済にする。
   * 受注伝票に記録した出荷指示フォルダ（またはその差替）で、まだ出荷指示フォルダ作成済の伝票だけ
   */
  private async reflectPrinted() {
    const dennos = [...new Set(this.folders
      .filter(e => e.done && !e.name.includes('【自動済') && !e.mismatch && e.jdstatus == JDST.FOLDER)
      .map(e => e.denno))];
    if (dennos.length == 0) {
      return;
    }
    const updated = await this.shipsrv.setPrinted(dennos);
    this.folders.filter(e => updated.includes(e.denno)).forEach(e => e.jdstatus = JDST.PRINTED);
  }

  /** 印刷のあと、フォルダに「【済」が付くまで一覧を読み直す（30 秒ごと、最大 20 分） */
  private watchPrinted(paths: string[]) {
    clearInterval(this.timer);
    let count = 0;
    this.timer = setInterval(async () => {
      if (this.busy) {
        return;
      }
      count++;
      await this.list(false);
      const left = paths.filter(p => this.folders.some(e => e.path == p));
      if (left.length == 0 || count >= 40) {
        clearInterval(this.timer);
        this.message = left.length == 0
          ? '印刷が終わりました（受注ステータスを出荷指示出力済にしました）'
          : '「【済」が付いていないフォルダがあります。印刷用スクリプトの画面のメッセージを確認してください';
        this.cdRef.detectChanges();
      }
    }, 30000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  checkAll(chk: boolean) {
    this.folders.filter(e => this.selectable(e)).forEach(e => e.chk = chk);
  }

  /** 印刷（印刷用スクリプトに渡し、受注ステータスを出荷指示出力済にする） */
  async print() {
    const sel = this.selFolders;
    if (sel.length == 0) {
      return;
    }
    const warn = sel.filter(e => e.mismatch || (e.jdstatus != null && e.jdstatus != JDST.FOLDER && e.jdstatus != JDST.PRINTED));
    if (warn.length > 0 && !confirm('受注伝票の出荷指示フォルダと違う（受注伝票を直したあとの古いフォルダの可能性がある）フォルダがあります：\n' +
      warn.map(e => e.name).join('\n') + '\n\n印刷しますか？')) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      // 印刷しない古いフォルダは「【自動済」にする（同じ担当者・伝票で、印刷するフォルダがあるもの）
      const old = this.folders.filter(e => e.old && sel.some(s => s.staff == e.staff && s.denno == e.denno));
      const job = { root: this.rootName, print: sel.map(e => e.path), old: old.map(e => e.path) };
      this.launch(job);
      this.message = sel.length + ' フォルダの印刷を指示しました。印刷がエラーなく複合機へ送られると、フォルダ名に「【済」が付き、' +
        '受注ステータスが出荷指示出力済になります（この画面を開いたままにしておくと 30 秒ごとに確認します）。';
      sel.forEach(e => e.chk = false);
      this.watchPrinted(sel.map(e => e.path));
    } catch (e) {
      this.message = '印刷の指示でエラーが発生しました：' + (e as Error).message;
      console.log('error shipprint print', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 印刷用スクリプトを呼ぶ（mwjprint:print?job=JSON の base64url） */
  private launch(job: { root: string; print: string[]; old: string[] }) {
    const bytes = new TextEncoder().encode(JSON.stringify(job));
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const a = document.createElement('a');
    a.href = 'mwjprint:print?job=' + b64;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
