import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
// import { MatLegacyTableDataSource as MatTableDataSource } from '@angular/material/legacy-table';
import { UserService } from './../services/user.service';
import { Nyuhis, DepositService } from './deposit.service';

@Component({
  selector: 'app-histtbl',
  templateUrl: './histtbl.component.html',
  styleUrls: ['./../tbl.component.scss']
})
export class HisttblComponent implements OnInit {
  // @Input() parentForm: FormGroup;
  dataSource = new MatTableDataSource();
  displayedColumns: string[] = [
    'denno',
    'nmoney',
    'smoney',
    'tmoney',
    'total',
    'memo'];

  constructor(private cdRef: ChangeDetectorRef,
    public depsrv: DepositService,
    public usrsrv: UserService) { }

  ngOnInit(): void {
    this.depsrv.observeH.subscribe((nyuhis) => {
      this.dataSource = new MatTableDataSource<Nyuhis>(nyuhis);
      this.cdRef.detectChanges();
    });
  }


}
