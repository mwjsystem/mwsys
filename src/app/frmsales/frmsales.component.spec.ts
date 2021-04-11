import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FrmsalesComponent } from './frmsales.component';

describe('FrmsalesComponent', () => {
  let component: FrmsalesComponent;
  let fixture: ComponentFixture<FrmsalesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FrmsalesComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FrmsalesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
