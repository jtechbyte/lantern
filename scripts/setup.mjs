import { writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const token = randomBytes(32).toString('hex');
const contents = `ADMIN_TOKEN=${token}\nENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nPOSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nPUBLIC_URL=http://localhost:7001\nPORT=7001\nDATA_DIR=./data\n`;
try {
  writeFileSync('.env', contents, { flag: 'wx', mode: 0o600 });
  console.log('Created .env. Read ADMIN_TOKEN there to sign in. Set PUBLIC_URL to your HTTPS address before installing remotely.');
} catch (error) {
  if (error.code === 'EEXIST') {
    if (!/^POSTGRES_PASSWORD=/m.test(readFileSync('.env','utf8'))) {
      appendFileSync('.env', `\nPOSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\n`);
      console.log('Added POSTGRES_PASSWORD. Existing credentials and encryption key were preserved.');
    } else console.log('.env already exists; kept existing credentials.');
  }
  else throw error;
}
