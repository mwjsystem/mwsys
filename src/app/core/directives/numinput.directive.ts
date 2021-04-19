import { Directive, HostListener, ElementRef, OnInit  } from '@angular/core';

@Directive({
  selector: '[numInput]'
})
export class NuminputDirective {
  
  private el: HTMLInputElement;
  private value: any;
  
  constructor(private elementRef: ElementRef) {
    this.el = this.elementRef.nativeElement;
  }
  
  @HostListener("focus", ["$event.target.value"])
  onFocus() {
    this.el.value = this.value; // opossite of transform
  }

  @HostListener("blur", ["$event.target.value"])
  onBlur(value) {
    this.transform(value)
  }

  ngOnInit() {
    this.transform(this.el.value)
  }
  
  transform(value) {

    const conv = value.replace(/[^0-9０-９]/g, '').replace(/[０-９]/g, function(s) {
        return String.fromCharCode(s.charCodeAt(0) - 65248);
    });   //数字のみ抽出して半角に変換


    this.value = conv;
    if(conv){
      this.el.value = this.format_number(conv, '');
    }
    if (this.el.value.indexOf(this.value)>=0){
      this.value=this.el.value
    }
    
    // const aux='' + Math.round(+this.value*100)
    // this.el.value = aux.slice(0,-2)+'.'+aux.slice(-2);
    // if (this.el.value.indexOf(this.value)>=0)
    //       this.value=this.el.value
   




  }
  // transform(val) {
  //   if(val){
  //   val = this.format_number(val, '');
  //   }
  //   return val;
  // }

  format_number(number, prefix) {
    let thousand_separator = ',',
      decimal_separator = '.',
      regex = new RegExp('[^' + decimal_separator + '\\d]', 'g'),
      number_string = number.toString().replace(regex, ''),
      split = number_string.split(decimal_separator),
      rest = split[0].length % 3,
      result = split[0].substr(0, rest),
      thousands = split[0].substr(rest).match(/\d{3}/g);

    if (thousands) {
      let separator = rest ? thousand_separator : '';
      result += separator + thousands.join(thousand_separator);
    }
    result = split[1] != undefined ? result + decimal_separator + split[1] : result;
    return prefix == undefined ? result : (result ? prefix + result : '');
  }

}
