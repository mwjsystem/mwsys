import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SimeitblComponent } from './simeitbl.component';

describe('SimeitblComponent', () => {
  let component: SimeitblComponent;
  let fixture: ComponentFixture<SimeitblComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SimeitblComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SimeitblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
