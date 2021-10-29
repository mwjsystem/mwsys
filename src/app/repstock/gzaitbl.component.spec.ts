import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GzaitblComponent } from './gzaitbl.component';

describe('GzaitblComponent', () => {
  let component: GzaitblComponent;
  let fixture: ComponentFixture<GzaitblComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GzaitblComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GzaitblComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
