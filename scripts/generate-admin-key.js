#!/usr/bin/env node
/**
 * Admin Key Generator Script
 * Use this to generate a new bcrypt-hashed admin key
 * 
 * Usage:
 * npm run generate-admin-key -- <your-admin-key>
 * Example: npm run generate-admin-key -- "MySecureAdminKey123!"
 */

const bcrypt = require('bcryptjs');

const key = process.argv[2];

if (!key) {
  console.error('❌ Error: Please provide an admin key');
  console.error('Usage: npm run generate-admin-key -- <your-admin-key>');
  process.exit(1);
}

if (key.length < 8) {
  console.error('❌ Error: Admin key must be at least 8 characters long');
  process.exit(1);
}

const hash = bcrypt.hashSync(key, 10);

console.log('\n✅ Admin Key Hash Generated:\n');
console.log(hash);
console.log('\n📝 Copy the hash above and set it as ADMIN_KEY_HASH in your .env file\n');
console.log('🔐 Security reminder:');
console.log('   - Keep this hash secret');
console.log('   - Share only the original key with admins, never the hash');
console.log('   - Use in headers as: X-Admin-Key: <original-key>\n');
