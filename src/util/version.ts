import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function toolVersion(): string {
  try {
    return (require('../../package.json') as { version: string }).version;
  } catch {
    try {
      return (require('../package.json') as { version: string }).version;
    } catch {
      return '0.0.0';
    }
  }
}
