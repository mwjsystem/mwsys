import { TestBed } from '@angular/core/testing';

import { BunruiService } from './bunrui.service';

describe('BunruiService', () => {
  let service: BunruiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BunruiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
