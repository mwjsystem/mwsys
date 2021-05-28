import { TestBed } from '@angular/core/testing';

import { TreatService } from './treat.service';

describe('TreatService', () => {
  let service: TreatService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TreatService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
