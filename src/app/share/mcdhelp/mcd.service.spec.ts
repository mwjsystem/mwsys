import { TestBed } from '@angular/core/testing';

import { McdService } from './mcd.service';

describe('McdService', () => {
  let service: McdService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(McdService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
