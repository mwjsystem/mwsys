import { Component, ChangeDetectionStrategy, input, inject } from '@angular/core';
import { MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatFooterCellDef, MatFooterCell, MatFooterRowDef, MatFooterRow } from '@angular/material/table';
import { DecimalPipe } from '@angular/common';
import { UserService } from './../services/user.service';
import { InvJyuden, InvNyusub } from './invoice.service';

/** 請求伝票に計上した受注伝票の一覧 */
@Component({
    selector: 'app-jdentbl',
    templateUrl: './jdentbl.component.html',
    styleUrls: ['./../tbl.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatFooterCellDef, MatFooterCell, MatFooterRowDef, MatFooterRow, DecimalPipe]
})
export class JdentblComponent {
  usrsrv = inject(UserService);

  readonly jyudens = input<InvJyuden[]>([]);
  readonly nyusubs = input<InvNyusub[]>([]);

  jColumns = ['denno', 'uday', 'taxmon', 'tax', 'total'];
  nColumns = ['denno', 'day', 'nmoney', 'smoney', 'tmoney', 'memo'];

  sumJ(fld: 'taxmon' | 'tax' | 'total'): number {
    return this.jyudens().reduce((sum, e) => sum + e[fld], 0);
  }
  sumN(fld: 'nmoney' | 'smoney' | 'tmoney'): number {
    return this.nyusubs().reduce((sum, e) => sum + e[fld], 0);
  }
}
