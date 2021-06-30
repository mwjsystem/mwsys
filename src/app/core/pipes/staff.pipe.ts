import { Pipe, PipeTransform } from '@angular/core';
import { StaffService } from './../../services/staff.service';

@Pipe({
  name: 'staff'
})
export class StaffPipe implements PipeTransform {
  constructor(private stfsrv: StaffService) {}

  transform(value: string): string {
    return this.stfsrv.get_name(value);  
  }

}
