import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HmeihelpComponent } from './hmeihelp.component';

describe('HmeihelpComponent', () => {
  let component: HmeihelpComponent;
  let fixture: ComponentFixture<HmeihelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ HmeihelpComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HmeihelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
