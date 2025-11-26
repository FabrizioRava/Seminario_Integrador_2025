
// src/common/pipes/sanitize.pipe.ts
import { PipeTransform, Injectable } from '@nestjs/common';
import { filterXSS } from 'xss';

@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: any) {
    if (typeof value === 'string') return filterXSS(value);
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, val]) => [
          key,
          typeof val === 'string' ? filterXSS(val) : val,
        ]),
      );
    }
    return value;
  }
}
