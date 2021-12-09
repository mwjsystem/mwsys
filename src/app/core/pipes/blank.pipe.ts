import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'blank'
})
export class BlankPipe implements PipeTransform {

  transform(value: any): any {
    if (typeof value == 'undefined') {
      return "";
    } else if (value==="none") {
      return "";
    } else if (value==="2000-01-01") {
      return "";
    } else if (value==="0") {
      return "";
    } else if (value===0) {
      return "";
    } else{
      return value;
    }
  }

}
