import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JdentblComponent } from './jdentbl.component';

describe('JdentblComponent', () => {
  let component: JdentblComponent;
  let fixture: ComponentFixture<JdentblComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ JdentblComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(JdentblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
