import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { EdatblComponent } from './edatbl.component';

describe('EdatblComponent', () => {
  let component: EdatblComponent;
  let fixture: ComponentFixture<EdatblComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ EdatblComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(EdatblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
