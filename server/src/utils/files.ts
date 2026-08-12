import fs from 'fs';
import path from 'path';
import { config } from '../config';

export function unlinkUpload(url: string) {
  const filename = path.basename(url);
  const filePath = path.join(config.uploadsDir, filename);
  fs.promises.unlink(filePath).catch(() => {});
}
