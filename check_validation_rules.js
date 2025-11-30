import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://0ec90b57d6e95fcbda19832f.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJib2x0IiwicmVmIjoiMGVjOTBiNTdkNmU5NWZjYmRhMTk4MzJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4ODE1NzQsImV4cCI6MTc1ODg4MTU3NH0.9I8-U0x86Ak8t2DGaIk0HfvTSLsAyzdnz-Nw00mMkKw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkValidationRules() {
  console.log('=== CHECKING VALIDATION RULES IN DATABASE ===\n');
  
  const result1 = await supabase
    .from('validation_rules')
    .select('*')
    .order('display_order');

  const allRules = result1.data;
  const allError = result1.error;

  if (allError) {
    console.error('Error fetching validation rules:', allError);
    return;
  }

  const totalRules = allRules ? allRules.length : 0;
  console.log('Total rules found: ' + totalRules + '\n');

  if (allRules && allRules.length > 0) {
    console.log('All Validation Rules:');
    console.log('----------------------------------------');
    allRules.forEach(rule => {
      console.log('Rule Name: ' + rule.rule_name);
      console.log('  Type: ' + rule.rule_type);
      console.log('  Category: ' + rule.category);
      console.log('  Active: ' + (rule.is_active ? 'YES' : 'NO'));
      console.log('  Pattern: ' + rule.validation_pattern);
      console.log('  Error Message: ' + rule.error_message);
      console.log('  Display Order: ' + rule.display_order);
      console.log('----------------------------------------');
    });
  } else {
    console.log('WARNING: NO VALIDATION RULES FOUND IN DATABASE!');
  }

  const result2 = await supabase
    .from('validation_rules')
    .select('*')
    .eq('is_active', true)
    .order('display_order');

  const activeRules = result2.data;

  console.log('\n=== ACTIVE RULES ONLY ===\n');
  const totalActive = activeRules ? activeRules.length : 0;
  console.log('Total active rules: ' + totalActive + '\n');

  if (activeRules && activeRules.length > 0) {
    console.log('Active Rule Names:');
    activeRules.forEach(rule => {
      console.log('  CHECK ' + rule.rule_name + ' (' + rule.category + ')');
    });
  }

  console.log('\n=== EXPECTED RULES CHECK ===\n');
  const expectedRules = [
    'email_format',
    'mobile_number',
    'gst_number',
    'pan_number',
    'aadhaar_number',
    'pin_code'
  ];

  for (const expectedRule of expectedRules) {
    const found = allRules ? allRules.find(r => r.rule_name === expectedRule) : null;
    if (found) {
      console.log('  CHECK ' + expectedRule + ' - EXISTS (Active: ' + found.is_active + ')');
    } else {
      console.log('  CROSS ' + expectedRule + ' - MISSING');
    }
  }

  console.log('\n=== FIELD-TO-RULE MAPPING VERIFICATION ===\n');
  const fieldMapping = {
    'email': 'email_format',
    'mobile_number': 'mobile_number',
    'alternate_mobile': 'mobile_number',
    'pin_code': 'pin_code',
    'pan_company': 'pan_number',
    'gst_number': 'gst_number'
  };

  console.log('Field mappings used in code:');
  for (const field in fieldMapping) {
    const ruleName = fieldMapping[field];
    const found = allRules ? allRules.find(r => r.rule_name === ruleName) : null;
    if (found) {
      console.log('  CHECK ' + field + ' -> ' + ruleName + ' (Rule exists, Active: ' + found.is_active + ')');
    } else {
      console.log('  CROSS ' + field + ' -> ' + ruleName + ' (Rule MISSING in database!)');
    }
  }
}

checkValidationRules().then(() => {
  console.log('\n=== CHECK COMPLETE ===');
  process.exit(0);
}).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
