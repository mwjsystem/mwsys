import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { AdrredaComponent } from './adrreda.component';

describe('AdrredaComponent', () => {
  let component: AdrredaComponent;
  let fixture: ComponentFixture<AdrredaComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ AdrredaComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AdrredaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
