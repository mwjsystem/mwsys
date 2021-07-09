import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HdnohelpComponent } from './hdnohelp.component';

describe('HdnohelpComponent', () => {
  let component: HdnohelpComponent;
  let fixture: ComponentFixture<HdnohelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ HdnohelpComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HdnohelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
