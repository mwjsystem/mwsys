import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'blank',
    standalone: false
})
export class BlankPipe implements PipeTransform {

  transform<T>(value: T): T | '' {
    if (typeof value == 'undefined') {
      return "";
    } else if (value === "none") {
      return "";
    } else if (value === "2000-01-01") {
      return "";
    } else if (value === "0") {
      return "";
    } else if (value === 0) {
      return "";
    } else {
      return value;
    }
  }

}
