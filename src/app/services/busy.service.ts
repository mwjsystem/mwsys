import { Injectable, signal } from '@angular/core';

/**
 * 処理中の表示（画面上部の「処理中…」とバー）。
 * 画面の切り替え・データベースの読み書き・帳票（PDF）の作成・NAS への保存のあいだ出す。
 * すぐ終わる処理でちらつかないよう、DELAY ミリ秒たっても終わらないときだけ出す
 */
@Injectable({
  providedIn: 'root'
})
export class BusyService {
  private static readonly DELAY = 300;
  /** inject できないところ（runBusy）から使うためのインスタンス */
  static current?: BusyService;

  constructor() {
    BusyService.current = this;
  }
  private running: string[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  /** 出しているか */
  readonly active = signal(false);
  /** 出している文言（いちばん新しく始めた処理のもの） */
  readonly label = signal('');

  /** 処理を始める。返した関数を呼ぶと終わる（何回呼んでもよい） */
  begin(label = '処理中…'): () => void {
    this.running.push(label);
    this.label.set(label);
    if (this.running.length == 1) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.active.set(this.running.length > 0), BusyService.DELAY);
    }
    let done = false;
    return () => {
      if (done) {
        return;
      }
      done = true;
      const i = this.running.lastIndexOf(label);
      if (i >= 0) {
        this.running.splice(i, 1);
      }
      this.label.set(this.running.at(-1) ?? '');
      if (this.running.length == 0) {
        clearTimeout(this.timer);
        this.active.set(false);
      }
    };
  }

  /** 処理（Promise を返す関数）のあいだ出す */
  async run<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const end = this.begin(label);
    try {
      return await fn();
    } finally {
      end();
    }
  }
}

/** 処理（Promise を返す関数）のあいだ「処理中」を出す（BusyService を inject していないところから使う） */
export function runBusy<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return BusyService.current ? BusyService.current.run(label, fn) : fn();
}

/** Excel（ExcelJS）を読み込むあいだ「処理中」を出す */
export const loadExcelJs = () => runBusy('Excel を作成しています…', () => import('exceljs'));
/** Excel のファイルを作るあいだ「処理中」を出す */
export const excelBuffer = <B>(wb: { xlsx: { writeBuffer(): Promise<B> } }): Promise<B> =>
  runBusy('Excel を作成しています…', () => wb.xlsx.writeBuffer());
