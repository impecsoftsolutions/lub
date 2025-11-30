import { supabase } from './lib/supabase';

export async function checkValidationRules() {
  console.log('=== CHECKING VALIDATION RULES IN DATABASE ===\n');
  
  const { data: allRules, error: allError } = await supabase
    .from('validation_rules')
    .select('*')
    .order('display_order');

  if (allError) {
    console.error('Error fetching validation rules:', allError);
    return { error: allError };
  }

  console.log(`Total rules found: ${allRules?.length || 0}\n`);

  if (allRules && allRules.length > 0) {
    console.log('All Validation Rules:');
    console.log('─'.repeat(100));
    allRules.forEach(rule => {
      console.log(`Rule Name: ${rule.rule_name}`);
      console.log(`  Type: ${rule.rule_type}`);
      console.log(`  Category: ${rule.category}`);
      console.log(`  Active: ${rule.is_active ? 'YES' : 'NO'}`);
      console.log(`  Pattern: ${rule.validation_pattern}`);
      console.log(`  Error Message: ${rule.error_message}`);
      console.log(`  Display Order: ${rule.display_order}`);
      console.log('─'.repeat(100));
    });
  } else {
    console.log('⚠️  NO VALIDATION RULES FOUND IN DATABASE!');
  }

  const { data: activeRules } = await supabase
    .from('validation_rules')
    .select('*')
    .eq('is_active', true)
    .order('display_order');

  console.log('\n=== ACTIVE RULES ONLY ===\n');
  console.log(`Total active rules: ${activeRules?.length || 0}\n`);

  if (activeRules && activeRules.length > 0) {
    console.log('Active Rule Names:');
    activeRules.forEach(rule => {
      console.log(`  ✓ ${rule.rule_name} (${rule.category})`);
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

  const missingRules: string[] = [];
  const inactiveRules: string[] = [];
  
  for (const expectedRule of expectedRules) {
    const found = allRules?.find(r => r.rule_name === expectedRule);
    if (found) {
      console.log(`  ✓ ${expectedRule} - EXISTS (Active: ${found.is_active})`);
      if (!found.is_active) {
        inactiveRules.push(expectedRule);
      }
    } else {
      console.log(`  ✗ ${expectedRule} - MISSING`);
      missingRules.push(expectedRule);
    }
  }

  console.log('\n=== FIELD-TO-RULE MAPPING VERIFICATION ===\n');
  const fieldMapping: Record<string, string> = {
    'email': 'email_format',
    'mobile_number': 'mobile_number',
    'alternate_mobile': 'mobile_number',
    'pin_code': 'pin_code',
    'pan_company': 'pan_number',
    'gst_number': 'gst_number'
  };

  console.log('Field mappings used in code:');
  const mappingIssues: string[] = [];
  
  for (const [field, ruleName] of Object.entries(fieldMapping)) {
    const found = allRules?.find(r => r.rule_name === ruleName);
    if (found) {
      console.log(`  ✓ ${field} → ${ruleName} (Rule exists, Active: ${found.is_active})`);
      if (!found.is_active) {
        mappingIssues.push(`${field} → ${ruleName} (inactive)`);
      }
    } else {
      console.log(`  ✗ ${field} → ${ruleName} (Rule MISSING in database!)`);
      mappingIssues.push(`${field} → ${ruleName} (missing)`);
    }
  }

  console.log('\n=== SUMMARY ===\n');
  console.log(`Total rules in database: ${allRules?.length || 0}`);
  console.log(`Active rules: ${activeRules?.length || 0}`);
  console.log(`Missing expected rules: ${missingRules.length}`);
  console.log(`Inactive expected rules: ${inactiveRules.length}`);
  console.log(`Field mapping issues: ${mappingIssues.length}`);
  
  if (missingRules.length > 0) {
    console.log('\n⚠️  Missing rules:', missingRules.join(', '));
  }
  
  if (inactiveRules.length > 0) {
    console.log('\n⚠️  Inactive rules:', inactiveRules.join(', '));
  }
  
  if (mappingIssues.length > 0) {
    console.log('\n⚠️  Mapping issues:', mappingIssues.join(', '));
  }

  return {
    allRules,
    activeRules,
    missingRules,
    inactiveRules,
    mappingIssues
  };
}
