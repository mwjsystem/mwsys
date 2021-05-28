import { TestBed } from '@angular/core/testing';

import { GcdService } from './gcd.service';

describe('GcdService', () => {
  let service: GcdService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GcdService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
