import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GtnktblComponent } from './gtnktbl.component';

describe('GtnktblComponent', () => {
  let component: GtnktblComponent;
  let fixture: ComponentFixture<GtnktblComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GtnktblComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GtnktblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
