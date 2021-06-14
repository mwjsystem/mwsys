import { TestBed } from '@angular/core/testing';

import { HatmeiService } from './hatmei.service';

describe('HatmeiService', () => {
  let service: HatmeiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HatmeiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
