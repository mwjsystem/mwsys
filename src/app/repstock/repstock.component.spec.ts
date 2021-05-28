import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RepstockComponent } from './repstock.component';

describe('RepstockComponent', () => {
  let component: RepstockComponent;
  let fixture: ComponentFixture<RepstockComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RepstockComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RepstockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
