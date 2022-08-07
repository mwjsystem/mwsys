import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HisttblComponent } from './histtbl.component';

describe('HisttblComponent', () => {
  let component: HisttblComponent;
  let fixture: ComponentFixture<HisttblComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ HisttblComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HisttblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
