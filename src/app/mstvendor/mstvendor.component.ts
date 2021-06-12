import { Component, OnInit, ViewChild, ElementRef, Output, EventEmitter } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
// import { Mcd, McdService } from './mcd.service';
import { Apollo } from 'apollo-angular';
import { UserService } from './../../services/user.service';



@Component({
  selector: 'app-mstvendor',
  templateUrl: './mstvendor.component.html',
  styleUrls: ['./mstvendor.component.scss']
})
export class MstvendorComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {
  }

}
