import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { UserService } from './../../services/user.service';

@Component({
  selector: 'app-tmstmp',
  templateUrl: './tmstmp.component.html',
  styleUrls: ['./tmstmp.component.scss'],
  changeDetection:ChangeDetectionStrategy.OnPush
})
export class TmstmpComponent implements OnInit {
  constructor(
    public cdRef: ChangeDetectorRef,
    public usrsrv: UserService) { }

  ngOnInit(): void {
    this.usrsrv.observe.subscribe(flg=>{
      this.cdRef.detectChanges();
    });
  }

}
