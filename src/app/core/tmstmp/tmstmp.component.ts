import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { UserService } from './../../services/user.service';

@Component({
    selector: 'app-tmstmp',
    templateUrl: './tmstmp.component.html',
    styleUrls: ['./tmstmp.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
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
