import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MsstitComponent } from './msstit.component';

describe('MsstitComponent', () => {
  let component: MsstitComponent;
  let fixture: ComponentFixture<MsstitComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MsstitComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MsstitComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
