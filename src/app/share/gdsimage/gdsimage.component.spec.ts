import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GdsimageComponent } from './gdsimage.component';

describe('GdsimageComponent', () => {
  let component: GdsimageComponent;
  let fixture: ComponentFixture<GdsimageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GdsimageComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GdsimageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
