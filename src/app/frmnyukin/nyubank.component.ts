import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { DecimalPipe } from '@angular/common';
import { UserService } from './../services/user.service';
import { BunruiService } from './../services/bunrui.service';
import { ClosedayService } from './../services/closeday.service';
import { NyuInvoice, NyuMember, NyuOrder, NyukinService, PTYPE } from './nyukin.service';
import { kanaMatch, money, parseCsv, readText } from './nyu-csv';

/** 入金の行き先（受注か請求伝票。まとめて入金のときは複数） */
interface Target { kind: 0 | 1; denno: number; mcode: string; money: number }

/** 候補（受注・請求伝票。金額と名前の合い方で並べる） */
interface Cand { key: string; label: string; score: number; targets: Target[] }

/** 入金明細の 1 行 */
interface BankRow {
  no: string;
  day: string;
  amount: number;
  payer: string;
  bank: string;
  /** 二重取込を防ぐ目印（入金伝票の備考に入れる） */
  ref: string;
  done: boolean;
  cands: Cand[];
  /** 選んだ候補の key（'' は作らない） */
  pick: string;
  /** 手で入れた受注伝票番号 */
  manual: string;
  on: boolean;
}

/**
 * 入金テキスト読込（売上入金 → 入金テキスト読込）。銀行の入金明細の CSV（照会口座, 番号, 勘定日, …, 入金金額, …, 摘要）を読み、
 * 振込人名（摘要のカナ）と金額から、入金残のある受注（都度）・請求伝票（掛売）の候補を出す。
 * 確かめてから、入金伝票（入金方法: 銀行振込、入金日: 勘定日）を作る。備考に「入金明細 日付-番号」を入れ、二重に取り込まない
 */
@Component({
  selector: 'app-nyubank',
  templateUrl: './nyubank.component.html',
  styleUrls: ['./nyubulk.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, RouterLink, MatToolbar, MatButton, MatIcon, MatTooltip, DecimalPipe]
})
export class NyubankComponent {
  usrsrv = inject(UserService);
  private bunsrv = inject(BunruiService);
  private closesrv = inject(ClosedayService);
  private nyusrv = inject(NyukinService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  rows: BankRow[] = [];
  members = new Map<string, NyuMember>();
  fileName = '';
  busy = false;
  message = '';
  error = '';

  constructor() {
    this.title.setTitle('入金テキスト読込(MWSystem)');
    this.bunsrv.qryBunrui().catch(e => console.log('error bunrui', e));
    this.closesrv.load();
  }

  name(m: string): string {
    return this.nyusrv.memberName(this.members.get(m));
  }

  get selected(): BankRow[] {
    return this.rows.filter(r => r.on && !r.done && (r.pick || Number(r.manual)));
  }

  get selectedSum(): number {
    return this.selected.reduce((a, r) => a + r.amount, 0);
  }

  async load(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.fileName = file.name;
    this.busy = true;
    this.error = '';
    this.message = '';
    this.rows = [];
    this.cdRef.detectChanges();
    try {
      const csv = parseCsv(await readText(file));
      const head = csv[0] ?? [];
      const col = (name: string) => head.findIndex(h => h.replace(/\s/g, '').startsWith(name));
      const ci = { no: col('番号'), day: col('勘定日'), nyu: col('入金金額'), bank: col('金融機関名'), branch: col('支店名'), memo: col('摘要') };
      if (ci.day < 0 || ci.nyu < 0 || ci.memo < 0) {
        throw new Error('入金明細の CSV ではありません（勘定日・入金金額・摘要の列がありません）');
      }
      const rows: BankRow[] = [];
      for (const c of csv.slice(1)) {
        const amount = money(c[ci.nyu]);
        if (!(amount > 0)) {
          continue;  // 出金の行は取り込まない
        }
        const m = String(c[ci.day] ?? '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
        const day = m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : '';
        const no = String(c[ci.no] ?? '').trim();
        rows.push({
          no, day, amount, payer: String(c[ci.memo] ?? '').trim(),
          bank: [c[ci.bank], c[ci.branch]].filter(e => e).join(' '),
          ref: '入金明細 ' + day.replace(/-/g, '') + '-' + no, done: false, cands: [], pick: '', manual: '', on: false
        });
      }
      if (rows.length == 0) {
        throw new Error('入金の行がありません');
      }
      await this.match(rows);
      this.rows = rows;
      const auto = rows.filter(r => r.on).length;
      this.message = rows.length + ' 件を読みました。名前と金額が合う ' + auto + ' 件に印を付けています。候補を確かめてください'
        + (rows.some(r => r.done) ? '（取込済 ' + rows.filter(r => r.done).length + ' 件）' : '');
    } catch (e) {
      this.error = '読めませんでした：' + (e as Error).message;
      console.log('error nyubank', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 入金残のある受注（都度）と請求伝票（掛売）から、候補を作る */
  private async match(rows: BankRow[]) {
    const since = new Date();
    since.setFullYear(since.getFullYear() - 1);
    const [orders, invoices, done] = await Promise.all([
      this.nyusrv.orders([{ nyuzan: { _gt: 0 } }, { _or: [{ torikbn: { _is_null: true } }, { torikbn: { _eq: false } }] }, { day: { _gte: this.usrsrv.formatDate(since) } }], 20000),
      this.nyusrv.invoices([{ zan: { _gt: 0 } }], 5000),
      this.nyusrv.memosExist(rows.map(r => r.ref))
    ]);
    this.members = await this.nyusrv.members([...orders.map(o => o.scde || o.mcode), ...invoices.map(i => i.mcode)]);
    const byMember = new Map<string, { orders: NyuOrder[]; invoices: NyuInvoice[] }>();
    const of = (m: string) => {
      let e = byMember.get(m);
      if (!e) {
        e = { orders: [], invoices: [] };
        byMember.set(m, e);
      }
      return e;
    };
    orders.forEach(o => of(o.scde || o.mcode).orders.push(o));
    invoices.forEach(i => of(i.mcode).invoices.push(i));

    for (const r of rows) {
      r.done = done.has(r.ref);
      const cands = new Map<string, Cand>();
      const add = (c: Cand) => {
        const old = cands.get(c.key);
        if (!old || old.score < c.score) {
          cands.set(c.key, c);
        }
      };
      byMember.forEach((e, mcode) => {
        const nameOk = kanaMatch(r.payer, this.members.get(mcode)?.kana ?? '');
        const nm = this.name(mcode);
        for (const o of e.orders) {
          const amountOk = o.nyuzan == r.amount;
          if (nameOk || amountOk) {
            add({
              key: 'J' + o.denno, score: (nameOk ? 2 : 0) + (amountOk ? 2 : 0),
              label: '受注 ' + o.denno + '　' + mcode + ' ' + nm + '　残 ' + o.nyuzan.toLocaleString() + '（売上 ' + (o.uday ?? '') + '）',
              targets: [{ kind: 0, denno: o.denno, mcode, money: r.amount }]
            });
          }
        }
        for (const s of e.invoices) {
          const amountOk = s.zan == r.amount;
          if (nameOk || amountOk) {
            add({
              key: 'I' + s.denno, score: (nameOk ? 2 : 0) + (amountOk ? 2 : 0) + 0.5,
              label: '請求 ' + s.denno + '（' + s.sday + ' 締め）　' + mcode + ' ' + nm + '　残 ' + s.zan.toLocaleString(),
              targets: [{ kind: 1, denno: s.denno, mcode, money: r.amount }]
            });
          }
        }
        // 名前が合い、残の合計が金額と同じなら、まとめて入金（受注を複数）
        if (nameOk && e.orders.length > 1) {
          const sum = e.orders.reduce((a, o) => a + o.nyuzan, 0);
          if (sum == r.amount) {
            add({
              key: 'M' + mcode, score: 4.5,
              label: 'まとめて 受注 ' + e.orders.length + ' 件（' + e.orders.map(o => o.denno).join('・') + '）　' + mcode + ' ' + nm,
              targets: e.orders.map(o => ({ kind: 0 as const, denno: o.denno, mcode, money: o.nyuzan }))
            });
          }
        }
      });
      r.cands = [...cands.values()].sort((a, b) => b.score - a.score).slice(0, 15);
      // 名前と金額が両方合う候補が 1 つなら、選んで印を付ける
      const best = r.cands.filter(c => c.score >= 4);
      if (best.length == 1 && !r.done) {
        r.pick = best[0].key;
        r.on = true;
      }
    }
  }

  /** 選んだ行に入金伝票を作る */
  async create() {
    const rows = this.selected;
    if (rows.length == 0) {
      return;
    }
    const closed = rows.filter(r => this.closesrv.isClosed(r.day));
    if (closed.length) {
      this.error = '締め日（' + this.closesrv.closeday + '）以前の入金があります（' + closed.map(r => r.no).join('・') + '）';
      return;
    }
    try {
      const slips = [];
      for (const r of rows) {
        let targets: Target[];
        if (r.pick) {
          targets = r.cands.find(c => c.key == r.pick)!.targets;
        } else {
          const o = await this.nyusrv.order(Number(r.manual));
          if (!o) {
            throw new Error('受注伝票 ' + r.manual + ' は登録されていません（明細 ' + r.no + '）');
          }
          targets = [{ kind: 0, denno: o.denno, mcode: o.scde || o.mcode, money: r.amount }];
        }
        for (const t of targets) {
          const s = this.nyusrv.simple(t.kind, r.day, t.mcode, PTYPE.GINKO, t.money, r.ref, t.kind == 0 ? { jdenno: t.denno } : { idenno: t.denno });
          s.lines[0].mmemo = r.payer.slice(0, 40);
          slips.push(s);
        }
      }
      if (!confirm(rows.length + ' 件・合計 ' + this.selectedSum.toLocaleString() + ' 円の入金伝票（' + slips.length + ' 枚）を作ります。よろしいですか？')) {
        return;
      }
      this.busy = true;
      this.error = '';
      this.cdRef.detectChanges();
      const dennos = await this.nyusrv.createMany(slips);
      rows.forEach(r => {
        r.done = true;
        r.on = false;
      });
      this.message = dennos.length + ' 枚の入金伝票を作りました（' + dennos[0] + '～' + dennos[dennos.length - 1] + '）';
      this.usrsrv.toastSuc(this.message);
    } catch (e) {
      this.error = '入金伝票を作れませんでした：' + (e as Error).message;
      console.log('error nyubank create', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 候補を選んだら印を付ける */
  pickChanged(r: BankRow) {
    r.on = !!r.pick || !!Number(r.manual);
  }
}
