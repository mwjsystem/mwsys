import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';

@Component({
  selector: 'app-spdethelp',
  templateUrl: './spdethelp.component.html',
  styleUrls: ['./spdethelp.component.scss']
})
export class SpdethelpComponent implements OnInit {
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  dataSource:MatTableDataSource<any>;
  public displayedColumns = ['denno','line','yday','ydaykbn','biko','insuu','nyumt','matzn'];
  constructor(public usrsrv: UserService,private apollo: Apollo,
              private dialogRef: MatDialogRef<SpdethelpComponent>) { }

  ngOnInit(): void {
  }

}
