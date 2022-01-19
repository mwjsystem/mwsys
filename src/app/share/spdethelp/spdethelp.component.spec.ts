import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SpdethelpComponent } from './spdethelp.component';

describe('SpdethelpComponent', () => {
  let component: SpdethelpComponent;
  let fixture: ComponentFixture<SpdethelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SpdethelpComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SpdethelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
