import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FrminvoiceComponent } from './frminvoice.component';

describe('FrminvoiceComponent', () => {
  let component: FrminvoiceComponent;
  let fixture: ComponentFixture<FrminvoiceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FrminvoiceComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FrminvoiceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
