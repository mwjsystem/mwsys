import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FrmsiireComponent } from './frmsiire.component';

describe('FrmsiireComponent', () => {
  let component: FrmsiireComponent;
  let fixture: ComponentFixture<FrmsiireComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FrmsiireComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FrmsiireComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
