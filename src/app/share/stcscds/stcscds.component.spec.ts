import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StcscdsComponent } from './stcscds.component';

describe('StcscdsComponent', () => {
  let component: StcscdsComponent;
  let fixture: ComponentFixture<StcscdsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StcscdsComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(StcscdsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
