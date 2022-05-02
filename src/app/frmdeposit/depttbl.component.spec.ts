import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DepttblComponent } from './depttbl.component';

describe('DepttblComponent', () => {
  let component: DepttblComponent;
  let fixture: ComponentFixture<DepttblComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DepttblComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DepttblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
