import { Directive, Input, ElementRef, HostListener, AfterViewInit } from '@angular/core';
import { TabService } from './tab.service';
type IKNOWISNUMBER = any;
type IKNOWISSTRING = any;

@Directive({
  selector: '[tabIndex]'
})
export class TabDirective implements AfterViewInit  {

  private _index: number;
  get index(): IKNOWISNUMBER{
    return this._index;
  }
  @Input('tabIndex')
  set index(i: IKNOWISSTRING){
    this._index = parseInt(i);
  }

  @HostListener('keydown', ['$event'])
  onInput(e: any) {
    // console.log(e,this.tabService.selectedInput);
    if (e.which === 13) {
      this.tabService.selectedInput.next(this.index + 1)
      e.preventDefault();
      // console.log(e,this.index);
    }
  }
  constructor(private el: ElementRef, private tabService: TabService) { 
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
