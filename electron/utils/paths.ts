import { app } from 'electron';
import path from 'node:path';

export const paths = {
  userData: () => app.getPath('userData'),
  instances: () => path.join(app.getPath('userData'), 'instances'),
  runtime: () => path.join(app.getPath('userData'), 'runtime'),
  cache: () => path.join(app.getPath('userData'), 'cache'),
  logs: () => path.join(app.getPath('userData'), 'logs'),
};
