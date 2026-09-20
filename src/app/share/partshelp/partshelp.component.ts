import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-partshelp',
    templateUrl: './partshelp.component.html',
    styleUrls: ['./../../help.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class PartshelpComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {
  }

}
