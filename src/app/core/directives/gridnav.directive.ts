import { Directive, ElementRef, inject, output } from '@angular/core';

/**
 * 伝票の明細表のキー操作（改善要望 No.9・17）。表の要素に付ける。
 * - →：次の入力欄へ／←：前の入力欄へ（Enter・Tab と同じ順）。
 *   文字の途中ではカーソルを動かし、先頭で ← ・末尾で → を押したとき（全部選んだ状態でも）に欄を移る
 * - Enter で次の欄へ進むのは TabDirective。最後の入力欄で Enter を押すと gridNavEnd を出す（明細の行を足す）
 * 順番は TabDirective が要素に付ける data-tabidx を使う（[tabIndex]="式" は要素の tabindex にならないため）。
 * 日本語入力の変換中は何もしない。
 */
@Directive({
  selector: '[gridNav]',
  host: {
    '(keydown)': 'onKey($event)'
  }
})
export class GridNavDirective {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** 最後の入力欄で Enter を押したとき */
  readonly gridNavEnd = output<void>();

  onKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
      return;
    }
    if (e.isComposing || e.keyCode === 229 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
      return;
    }
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type === 'checkbox') {
      return;
    }
    const list = this.inputs();
    const k = list.indexOf(t);
    if (k < 0) {
      return;
    }
    if (e.key === 'Enter') {
      // 次の欄への移動は TabDirective（[tabIndex]）がする。ここでは最後の欄のときだけ行を足す
      if (k + 1 === list.length) {
        e.preventDefault();
        this.gridNavEnd.emit();
      }
      return;
    }
    const left = e.key === 'ArrowLeft';
    if (!this.atEdge(t, left)) {
      return; // 文字の途中はふつうにカーソルを動かす
    }
    const to = list[left ? k - 1 : k + 1];
    if (to) {
      e.preventDefault();
      to.focus();
      try {
        to.select();
      } catch {
        // select できない欄もある
      }
    }
  }

  /** カーソルが先頭（←）・末尾（→）にあるか。全部選んだ状態・数値の欄（カーソル位置が取れない）は端とみなす */
  private atEdge(el: HTMLInputElement, left: boolean): boolean {
    let s: number | null;
    let en: number | null;
    try {
      s = el.selectionStart;
      en = el.selectionEnd;
    } catch {
      return true;
    }
    if (s == null || en == null) {
      return true;
    }
    const len = el.value.length;
    if (s === 0 && en === len) {
      return true;
    }
    return left ? (s === 0 && en === 0) : (s === len && en === len);
  }

  /** 表の中で入力できる欄（TabDirective の番号があるもの）を、Enter で進む順に */
  private inputs(): HTMLInputElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLInputElement>('input[data-tabidx]'))
      .map((el, dom) => ({ el, dom, idx: Number(el.dataset['tabidx']) }))
      .filter(x => !isNaN(x.idx) && !x.el.disabled && !x.el.readOnly && x.el.type !== 'checkbox' && x.el.offsetParent !== null)
      .sort((a, b) => a.idx - b.idx || a.dom - b.dom)
      .map(x => x.el);
  }
}
