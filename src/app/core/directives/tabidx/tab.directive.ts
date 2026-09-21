import { Directive, Input, ElementRef, AfterViewInit, inject } from '@angular/core';
import { TabService } from './tab.service';

@Directive({
    selector: '[tabIndex]',
    standalone: false,
    host: {
        '(keydown)': 'onInput($event)'
    }
})
export class TabDirective implements AfterViewInit  {
  private el = inject(ElementRef);
  private tabService = inject(TabService);


  private _index!: number;
  get index(): number {
    return this._index;
  }
  @Input('tabIndex')
  set index(i: string | number) {
    this._index = parseInt(String(i)); // 属性値は文字列で渡されることが多い
  }

  onInput(e: KeyboardEvent) {
    // console.log(e,this.tabService.selectedInput);
    if (e.which === 13) {
      this.tabService.selectedInput.next(this.index + 1)
      e.preventDefault();
      // console.log(e,this.index);
    }
  }

  ngAfterViewInit(){
    this.tabService.selectedInput.subscribe((i) => {
      setTimeout(() => {
        if (i === this.index){
          this.el.nativeElement.focus();
        }
      });  
    });
  }

}
