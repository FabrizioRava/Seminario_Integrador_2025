
import { PipeTransform, Injectable } from '@nestjs/common';
import * as xss from 'xss';

@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: any) {
    if (typeof value === 'string') return xss(value);
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, val]) => [
          key,
          typeof val === 'string' ? xss(val) : val
        ])
      );
    }
    return value;
  }
}
