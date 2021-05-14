import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GrpcdhelpComponent } from './grpcdhelp.component';

describe('GrpcdhelpComponent', () => {
  let component: GrpcdhelpComponent;
  let fixture: ComponentFixture<GrpcdhelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GrpcdhelpComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GrpcdhelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
