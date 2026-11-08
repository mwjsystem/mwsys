import { Directive, ElementRef, inject, output } from '@angular/core';

/**
 * 伝票の明細表のキー操作（改善要望 No.9・17）。表の要素に付ける。
 * - ↓：次の入力欄へ／↑：前の入力欄へ（通販Pro と同じ。Tab と同じ順。数量の欄で数値が増減しないようにする）
 * - Enter で次の欄へ進むのは TabDirective。最後の入力欄で Enter を押すと gridNavEnd を出す（明細の行を足す）
 * 日本語入力の変換中（確定の Enter）は何もしない。
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
    if (e.key !== 'Enter' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
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
    e.preventDefault();
    this.move(e.key === 'ArrowUp' ? list[k - 1] : list[k + 1]);
  }

  /** 表の中で入力できる欄（tabIndex を付けたもの）を、Tab で進む順に */
  private inputs(): HTMLInputElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLInputElement>('input'))
      .filter(el => el.tabIndex > 0 && !el.disabled && !el.readOnly && el.type !== 'checkbox' && el.offsetParent !== null)
      .map((el, dom) => ({ el, dom }))
      .sort((a, b) => a.el.tabIndex - b.el.tabIndex || a.dom - b.dom)
      .map(x => x.el);
  }

  private move(el: HTMLInputElement | undefined): void {
    if (!el) {
      return;
    }
    el.focus();
    try {
      el.select();
    } catch {
      // type=number など select できない欄もある
    }
  }
}
