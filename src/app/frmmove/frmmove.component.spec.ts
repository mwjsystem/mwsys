import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FrmmoveComponent } from './frmmove.component';

describe('FrmmoveComponent', () => {
  let component: FrmmoveComponent;
  let fixture: ComponentFixture<FrmmoveComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FrmmoveComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FrmmoveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
