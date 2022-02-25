import { TestBed } from '@angular/core/testing';

import { SiimeiService } from './siimei.service';

describe('SiimeiService', () => {
  let service: SiimeiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SiimeiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
