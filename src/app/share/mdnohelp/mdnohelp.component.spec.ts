import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MdnohelpComponent } from './mdnohelp.component';

describe('MdnohelpComponent', () => {
  let component: MdnohelpComponent;
  let fixture: ComponentFixture<MdnohelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MdnohelpComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MdnohelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
