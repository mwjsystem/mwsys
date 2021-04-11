import { TestBed } from '@angular/core/testing';

import { MembsService } from './membs.service';

describe('MembsService', () => {
  let service: MembsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MembsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
