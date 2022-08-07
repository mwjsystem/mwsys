import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MovtblComponent } from './movtbl.component';

describe('MovtblComponent', () => {
  let component: MovtblComponent;
  let fixture: ComponentFixture<MovtblComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MovtblComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MovtblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
