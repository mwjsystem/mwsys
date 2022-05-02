import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FrmdepositComponent } from './frmdeposit.component';

describe('FrmdepositComponent', () => {
  let component: FrmdepositComponent;
  let fixture: ComponentFixture<FrmdepositComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FrmdepositComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FrmdepositComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
