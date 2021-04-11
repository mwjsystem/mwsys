import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JmeitblComponent } from './jmeitbl.component';

describe('JmeitblComponent', () => {
  let component: JmeitblComponent;
  let fixture: ComponentFixture<JmeitblComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ JmeitblComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(JmeitblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
