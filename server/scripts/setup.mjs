import { copyFileSync, constants } from 'node:fs';

try {
  copyFileSync(new URL('../.env.example', import.meta.url), new URL('../.env', import.meta.url), constants.COPYFILE_EXCL);
  console.log('Created .env from .env.example. Review it before seeding.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Keeping existing .env.');
}
