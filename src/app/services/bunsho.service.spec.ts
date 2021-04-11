import { TestBed } from '@angular/core/testing';

import { BunshoService } from './bunsho.service';

describe('BunshoService', () => {
  let service: BunsyoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BunsyoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
