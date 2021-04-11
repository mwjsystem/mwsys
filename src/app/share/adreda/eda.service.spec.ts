import { TestBed } from '@angular/core/testing';

import { EdaService } from './eda.service';

describe('EdaService', () => {
  let service: EdaService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EdaService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
