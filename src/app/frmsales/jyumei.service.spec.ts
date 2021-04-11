import { TestBed } from '@angular/core/testing';

import { JyumeiService } from './jyumei.service';

describe('JyumeiService', () => {
  let service: JyumeiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(JyumeiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
