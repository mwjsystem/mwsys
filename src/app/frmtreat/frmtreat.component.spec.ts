import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FrmtreatComponent } from './frmtreat.component';

describe('FrmtreatComponent', () => {
  let component: FrmtreatComponent;
  let fixture: ComponentFixture<FrmtreatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FrmtreatComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FrmtreatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
