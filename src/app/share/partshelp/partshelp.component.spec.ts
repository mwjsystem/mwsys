import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PartshelpComponent } from './partshelp.component';

describe('PartshelpComponent', () => {
  let component: PartshelpComponent;
  let fixture: ComponentFixture<PartshelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PartshelpComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PartshelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
