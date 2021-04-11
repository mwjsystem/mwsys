import { TestBed } from '@angular/core/testing';

import { OkuriService } from './okuri.service';

describe('OkuriService', () => {
  let service: OkuriService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OkuriService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
