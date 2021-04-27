import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FrmkeepComponent } from './frmkeep.component';

describe('FrmkeepComponent', () => {
  let component: FrmkeepComponent;
  let fixture: ComponentFixture<FrmkeepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FrmkeepComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FrmkeepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
