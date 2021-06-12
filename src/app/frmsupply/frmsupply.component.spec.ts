import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FrmsupplyComponent } from './frmsupply.component';

describe('FrmsupplyComponent', () => {
  let component: FrmsupplyComponent;
  let fixture: ComponentFixture<FrmsupplyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FrmsupplyComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FrmsupplyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
