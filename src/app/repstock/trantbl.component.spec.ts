import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TrantblComponent } from './trantbl.component';

describe('TrantblComponent', () => {
  let component: TrantblComponent;
  let fixture: ComponentFixture<TrantblComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TrantblComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TrantblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
