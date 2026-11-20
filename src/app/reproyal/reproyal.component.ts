import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import * as FileSaver from 'file-saver';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel, MatInput, MatSuffix } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from '@angular/material/datepicker';
import { loadExcelJs, excelBuffer } from './../services/busy.service';
import { RoyOrg, RoyaltyService } from './royalty.service';
import { RoyCtx, RoyResult, ashihara, ibko, naniwa, nas, oishi, yushi } from './royalty-calc';
import { daido, jkjo, rengo } from './royalty-calc2';
import { shinAnnual, shinkyoku } from './royalty-shin';

/** 団体のキー → 集計 */
const CALC: Record<string, (c: RoyCtx) => Promise<RoyResult>> = { shinkyoku, daido, ashihara, rengo, naniwa, jkjo, yushi, nas, ibko, oishi };

const iso = (d: Date): string => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);

/**
 * ロイヤリティ（現行の各団体のロイヤリティ Excel の置き換え）。団体と期間を選んで集計し、明細書の Excel を作る。
 * 集計する商品・顧客・単価はロイヤリティマスタで変える。
 */
@Component({
  selector: 'app-reproyal',
  templateUrl: './reproyal.component.html',
  styleUrls: ['./reproyal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbar, MatButton, MatIcon, MatFormField, MatLabel, MatInput, MatSuffix, MatSelect, MatOption,
    MatDatepickerInput, MatDatepickerToggle, MatDatepicker, FormsModule, RouterLink]
})
export class ReproyalComponent implements OnInit {
  private srv = inject(RoyaltyService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  orgs: RoyOrg[] = [];
  org = '';
  from: Date;
  to: Date;
  /** 新極真会: 受付日の開始 */
  recvFrom: Date;
  /** 新極真会: 年間集計表の年度 */
  fy: number;
  busy = false;
  msg = '';
  error = '';
  result?: RoyResult;

  constructor() {
    this.title.setTitle('ロイヤリティ(MWSystem)');
    const now = new Date();
    this.from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    this.to = new Date(now.getFullYear(), now.getMonth(), 0);
    this.recvFrom = new Date(now.getFullYear(), now.getMonth() - 2, 15);
    const pm = this.from;
    this.fy = pm.getMonth() < 3 ? pm.getFullYear() - 1 : pm.getFullYear();
  }

  async ngOnInit() {
    try {
      this.orgs = await this.srv.orgs();
      this.org = this.orgs[0]?.org ?? '';
      if (this.orgs.length == 0) {
        this.error = 'ロイヤリティの団体がありません（db/20261129_royalty.sql を適用してください）';
      }
    } catch (e) {
      this.error = '団体を読めませんでした：' + (e as Error).message;
      console.log('error reproyal orgs', e);
    }
    this.cdRef.detectChanges();
  }

  /** 期間の初日を変えたら、末日と新極真会の受付日の開始を合わせる */
  fromChanged() {
    if (!this.from) {
      return;
    }
    const f = new Date(this.from);
    this.to = new Date(f.getFullYear(), f.getMonth() + 1, 0);
    this.recvFrom = new Date(f.getFullYear(), f.getMonth() - 1, 15);
  }

  get orgName(): string {
    return this.orgs.find(e => e.org == this.org)?.name ?? '';
  }

  private async ctx(): Promise<RoyCtx> {
    const m = await this.srv.master(this.org);
    const f = new Date(this.from);
    return {
      srv: this.srv, m, from: iso(f), to: iso(new Date(this.to)), y: f.getFullYear(), mth: f.getMonth() + 1,
      recvFrom: iso(new Date(this.recvFrom)), chuName: await this.srv.chubunruiName()
    };
  }

  /** 集計して Excel を作る */
  async run(annual = false) {
    if (!this.org || !this.from || !this.to) {
      return;
    }
    if (!annual && new Date(this.from) > new Date(this.to)) {
      this.error = '期間の初日が末日より後になっています';
      return;
    }
    this.busy = true;
    this.error = '';
    this.result = undefined;
    this.msg = '集計しています…';
    this.cdRef.detectChanges();
    try {
      const c = await this.ctx();
      const calc = annual ? (x: RoyCtx) => shinAnnual(x, this.fy, msg => {
        this.msg = msg;
        this.cdRef.detectChanges();
      }) : CALC[this.org];
      if (!calc) {
        throw new Error('団体 ' + this.org + ' の集計方法がありません');
      }
      const res = await calc(c);
      this.msg = 'Excel を作っています…';
      this.cdRef.detectChanges();
      const lib = await loadExcelJs();
      const Workbook = lib.Workbook ?? lib.default.Workbook;
      for (const b of res.books) {
        const wb = new Workbook();
        // 数式は Excel で開いたときに計算し直す（手で数を入れたときも合計が合うように）
        wb.calcProperties = { ...wb.calcProperties, fullCalcOnLoad: true };
        b.fill(wb);
        const buf = await excelBuffer(wb);
        FileSaver.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), b.file + '.xlsx');
      }
      this.result = res;
      this.msg = '';
    } catch (e) {
      this.error = '集計できませんでした：' + (e as Error).message;
      this.msg = '';
      console.log('error reproyal', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
