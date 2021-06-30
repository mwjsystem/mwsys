import { TestBed } from '@angular/core/testing';

import { VendsService } from './vends.service';

describe('VendsService', () => {
  let service: VendsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VendsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
