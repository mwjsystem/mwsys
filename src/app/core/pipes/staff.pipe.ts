import { Pipe, PipeTransform, inject } from '@angular/core';
import { StaffService } from './../../services/staff.service';

@Pipe({ name: 'staff' })
export class StaffPipe implements PipeTransform {
  private stfsrv = inject(StaffService);


  transform(value: string): string {
    return this.stfsrv.getName(value);
  }

}
