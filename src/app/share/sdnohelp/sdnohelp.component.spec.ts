import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SdnohelpComponent } from './sdnohelp.component';

describe('SdnohelpComponent', () => {
  let component: SdnohelpComponent;
  let fixture: ComponentFixture<SdnohelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SdnohelpComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SdnohelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
