import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-frmclear',
    templateUrl: './frmclear.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class FrmclearComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {
  }

}
