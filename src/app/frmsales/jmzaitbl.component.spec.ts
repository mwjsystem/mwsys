import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JmzaitblComponent } from './jmzaitbl.component';

describe('JmzaitblComponent', () => {
  let component: JmzaitblComponent;
  let fixture: ComponentFixture<JmzaitblComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ JmzaitblComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(JmzaitblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
