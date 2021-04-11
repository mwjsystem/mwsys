import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { McdhelpComponent } from './mcdhelp.component';

describe('McdhelpComponent', () => {
  let component: McdhelpComponent;
  let fixture: ComponentFixture<McdhelpComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ McdhelpComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(McdhelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
