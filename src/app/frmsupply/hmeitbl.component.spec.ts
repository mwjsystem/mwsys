import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HmeitblComponent } from './hmeitbl.component';

describe('HmeitblComponent', () => {
  let component: HmeitblComponent;
  let fixture: ComponentFixture<HmeitblComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ HmeitblComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HmeitblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
