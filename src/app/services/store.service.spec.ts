import { TestBed } from '@angular/core/testing';

import { SoukoService } from './souko.service';

describe('SoukoService', () => {
  let service: SoukoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SoukoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
