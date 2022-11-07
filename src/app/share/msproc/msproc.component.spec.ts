import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MsprocComponent } from './msproc.component';

describe('MsprocComponent', () => {
  let component: MsprocComponent;
  let fixture: ComponentFixture<MsprocComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MsprocComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MsprocComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
