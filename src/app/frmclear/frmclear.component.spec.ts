import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FrmclearComponent } from './frmclear.component';

describe('FrmclearComponent', () => {
  let component: FrmclearComponent;
  let fixture: ComponentFixture<FrmclearComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FrmclearComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FrmclearComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
