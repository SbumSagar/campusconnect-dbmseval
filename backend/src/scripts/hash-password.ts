/**
 * Prints a bcrypt hash for DEMO_*_PASSWORD_HASH.
 * Usage: npm run hash-password --workspace backend -- "my-password"
 */
import bcrypt from 'bcryptjs';

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: npm run hash-password --workspace backend -- "<password>"');
  process.exit(1);
}
console.log(bcrypt.hashSync(pw, 12));
