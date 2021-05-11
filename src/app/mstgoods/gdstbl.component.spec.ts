import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GdstblComponent } from './gdstbl.component';

describe('GdstblComponent', () => {
  let component: GdstblComponent;
  let fixture: ComponentFixture<GdstblComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GdstblComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GdstblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
