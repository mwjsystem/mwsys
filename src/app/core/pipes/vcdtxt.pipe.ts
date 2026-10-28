import { Pipe, PipeTransform, inject } from '@angular/core';
import { VendsService } from './../../mstvendor/vends.service';

@Pipe({ name: 'vcdtxt' })
export class VcdtxtPipe implements PipeTransform {
  private vensrv = inject(VendsService);

  transform(value: string): string {
    return this.vensrv.getVcdtxt(value);
  }
}
