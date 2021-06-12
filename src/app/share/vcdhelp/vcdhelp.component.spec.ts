import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VcdhelpComponent } from './vcdhelp.component';

describe('VcdhelpComponent', () => {
  let component: VcdhelpComponent;
  let fixture: ComponentFixture<VcdhelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ VcdhelpComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(VcdhelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
