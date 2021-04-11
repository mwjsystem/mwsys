import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MstmemberComponent } from './mstmember.component';

describe('MstmemberComponent', () => {
  let component: MstmemberComponent;
  let fixture: ComponentFixture<MstmemberComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MstmemberComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MstmemberComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
