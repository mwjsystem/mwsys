import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { McdtblComponent } from './mcdtbl.component';

describe('McdtblComponent', () => {
  let component: McdtblComponent;
  let fixture: ComponentFixture<McdtblComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ McdtblComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(McdtblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
