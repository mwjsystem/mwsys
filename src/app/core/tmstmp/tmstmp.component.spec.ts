import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { TmstmpComponent } from './tmstmp.component';

describe('TmstmpComponent', () => {
  let component: TmstmpComponent;
  let fixture: ComponentFixture<TmstmpComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ TmstmpComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TmstmpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
