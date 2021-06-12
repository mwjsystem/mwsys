import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MstvendorComponent } from './mstvendor.component';

describe('MstvendorComponent', () => {
  let component: MstvendorComponent;
  let fixture: ComponentFixture<MstvendorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MstvendorComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MstvendorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
