import { Pipe, PipeTransform, inject } from '@angular/core';
import { MembsService } from './../../mstmember/membs.service';

@Pipe({ name: 'mcdtxt' })
export class McdtxtPipe implements PipeTransform {
  private memsrv = inject(MembsService);


  transform(value: string): string {
    return this.memsrv.getMcdtxt(value);
  }

}
