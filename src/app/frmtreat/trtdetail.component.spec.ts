import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FrmtrtdetComponent } from './frmtrtdet.component';

describe('FrmtrtdetComponent', () => {
  let component: FrmtrtdetComponent;
  let fixture: ComponentFixture<FrmtrtdetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FrmtrtdetComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FrmtrtdetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
