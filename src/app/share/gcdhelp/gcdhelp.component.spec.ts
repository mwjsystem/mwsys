import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GcdhelpComponent } from './gcdhelp.component';

describe('GcdhelpComponent', () => {
  let component: GcdhelpComponent;
  let fixture: ComponentFixture<GcdhelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GcdhelpComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GcdhelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
