import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NdnohelpComponent } from './ndnohelp.component';

describe('NdnohelpComponent', () => {
  let component: NdnohelpComponent;
  let fixture: ComponentFixture<NdnohelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ NdnohelpComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(NdnohelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
