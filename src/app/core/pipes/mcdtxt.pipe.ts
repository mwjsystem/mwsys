import { Pipe, PipeTransform } from '@angular/core';
import { MembsService } from './../../services/membs.service';

@Pipe({
  name: 'mcdtxt'
})
export class McdtxtPipe implements PipeTransform {
  constructor(private memsrv: MembsService) {}

  transform(value: string): string {
    return this.memsrv.get_mcdtxt(value);  
  }

}
