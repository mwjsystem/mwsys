import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MstgoodsComponent } from './mstgoods.component';

describe('MstgoodsComponent', () => {
  let component: MstgoodsComponent;
  let fixture: ComponentFixture<MstgoodsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MstgoodsComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MstgoodsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
