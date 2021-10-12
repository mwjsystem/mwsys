import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GzaiComponent } from './gzai.component';

describe('GzaiComponent', () => {
  let component: GzaiComponent;
  let fixture: ComponentFixture<GzaiComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GzaiComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GzaiComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
