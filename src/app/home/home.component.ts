import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./../app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HomeComponent implements OnInit {
  private title = inject(Title);

  // userInfo: {[key: string]: any} = {};
  constructor() {
    this.title.setTitle('ホーム(MWSystem)');
  }

  ngOnInit(): void {
  }

}
