import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { UserService } from './../../services/user.service';
import { DatePipe } from '@angular/common';
import { StaffPipe } from '../pipes/staff.pipe';

@Component({
    selector: 'app-tmstmp',
    templateUrl: './tmstmp.component.html',
    styleUrls: ['./tmstmp.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DatePipe, StaffPipe]
})
export class TmstmpComponent implements OnInit {
  cdRef = inject(ChangeDetectorRef);
  usrsrv = inject(UserService);


  ngOnInit(): void {
    this.usrsrv.observe.subscribe(flg=>{
      this.cdRef.detectChanges();
    });
  }

}
