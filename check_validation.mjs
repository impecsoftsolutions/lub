import pg from 'pg';
const { Client } = pg;

// Get connection string from environment or construct it
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.0ec90b57d6e95fcbda19832f:your_password@aws-0-us-west-1.pooler.supabase.com:6543/postgres';

async function checkValidationRules() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('=== CHECKING VALIDATION RULES IN DATABASE ===\n');
    
    const result = await client.query('SELECT * FROM validation_rules ORDER BY display_order');
    const allRules = result.rows;
    
    console.log('Total rules found: ' + allRules.length + '\n');
    
    if (allRules.length > 0) {
      console.log('All Validation Rules:');
      console.log('----------------------------------------');
      allRules.forEach(rule => {
        console.log('Rule Name: ' + rule.rule_name);
        console.log('  Type: ' + rule.rule_type);
        console.log('  Category: ' + rule.category);
        console.log('  Active: ' + (rule.is_active ? 'YES' : 'NO'));
        console.log('  Pattern: ' + rule.validation_pattern);
        console.log('  Error Message: ' + rule.error_message);
        console.log('----------------------------------------');
      });
    } else {
      console.log('WARNING: NO VALIDATION RULES FOUND!');
    }
    
    console.log('\n=== EXPECTED RULES CHECK ===\n');
    const expectedRules = ['email_format', 'mobile_number', 'gst_number', 'pan_number', 'aadhaar_number', 'pin_code'];
    
    for (const expectedRule of expectedRules) {
      const found = allRules.find(r => r.rule_name === expectedRule);
      if (found) {
        console.log('  CHECK ' + expectedRule + ' - EXISTS (Active: ' + found.is_active + ')');
      } else {
        console.log('  CROSS ' + expectedRule + ' - MISSING');
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkValidationRules();
