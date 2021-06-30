import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JdnohelpComponent } from './jdnohelp.component';

describe('JdnohelpComponent', () => {
  let component: JdnohelpComponent;
  let fixture: ComponentFixture<JdnohelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ JdnohelpComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(JdnohelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
