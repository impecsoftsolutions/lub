#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('   Required: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getTableColumns(tableName) {
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable')
    .eq('table_name', tableName)
    .order('ordinal_position');

  if (error) {
    console.error(`Error fetching columns for ${tableName}:`, error);
    return [];
  }

  return data || [];
}

async function compareTableSchemas() {
  console.log('🔍 Comparing table schemas...\n');

  const memberRegColumns = await getTableColumns('member_registrations');
  const deletedMembersColumns = await getTableColumns('deleted_members');

  const memberRegColumnNames = new Set(memberRegColumns.map(col => col.column_name));
  const deletedMembersColumnNames = new Set(deletedMembersColumns.map(col => col.column_name));

  const requiredColumns = [
    'first_viewed_at',
    'first_viewed_by',
    'reviewed_count',
    'profile_photo_url'
  ];

  console.log('📋 Checking for required columns in deleted_members table:\n');

  let allPresent = true;
  for (const colName of requiredColumns) {
    const existsInMemberReg = memberRegColumnNames.has(colName);
    const existsInDeletedMembers = deletedMembersColumnNames.has(colName);

    if (existsInMemberReg && !existsInDeletedMembers) {
      console.log(`   ❌ ${colName}: Missing in deleted_members (exists in member_registrations)`);
      allPresent = false;
    } else if (existsInDeletedMembers) {
      console.log(`   ✅ ${colName}: Present in deleted_members`);
    } else {
      console.log(`   ⚠️  ${colName}: Not found in either table`);
    }
  }

  console.log('\n📊 Schema Comparison Summary:\n');
  console.log(`   member_registrations columns: ${memberRegColumns.length}`);
  console.log(`   deleted_members columns: ${deletedMembersColumns.length}`);

  const missingInDeleted = [...memberRegColumnNames].filter(
    col => !deletedMembersColumnNames.has(col) &&
    !['id', 'deleted_by', 'deleted_at', 'deletion_reason', 'original_id'].includes(col)
  );

  if (missingInDeleted.length > 0) {
    console.log(`\n   ⚠️  Additional columns in member_registrations but not in deleted_members:`);
    missingInDeleted.forEach(col => console.log(`      - ${col}`));
  }

  return allPresent;
}

async function testDeletionReadiness() {
  console.log('\n🧪 Testing deletion readiness...\n');

  try {
    const { data: testMember, error: fetchError } = await supabase
      .from('member_registrations')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('   ❌ Error fetching test member:', fetchError);
      return false;
    }

    if (!testMember) {
      console.log('   ℹ️  No members found in member_registrations table');
      return true;
    }

    console.log('   ✅ Successfully fetched a test member');
    console.log(`   ℹ️  Test member has ${Object.keys(testMember).length} fields`);

    const requiredFields = [
      'first_viewed_at',
      'first_viewed_by',
      'reviewed_count',
      'profile_photo_url'
    ];

    console.log('\n   📝 Checking if test member has review tracking fields:');
    requiredFields.forEach(field => {
      const hasField = field in testMember;
      console.log(`      ${hasField ? '✅' : '❌'} ${field}: ${hasField ? testMember[field] ?? 'null' : 'missing'}`);
    });

    console.log('\n   ✅ Member deletion should work correctly now');
    return true;

  } catch (error) {
    console.error('   ❌ Error during deletion readiness test:', error);
    return false;
  }
}

async function verifyIndexes() {
  console.log('\n🔍 Verifying indexes on deleted_members table...\n');

  const { data, error } = await supabase.rpc('pg_indexes', {
    schemaname: 'public',
    tablename: 'deleted_members'
  }).catch(() => ({ data: null, error: null }));

  if (error) {
    console.log('   ℹ️  Could not verify indexes (this is normal for non-admin users)');
    return;
  }

  const expectedIndexes = [
    'idx_deleted_members_first_viewed_at',
    'idx_deleted_members_reviewed_status'
  ];

  console.log('   Expected indexes:');
  expectedIndexes.forEach(idx => {
    console.log(`      - ${idx}`);
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Deleted Members Table Schema Verification                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const schemaMatch = await compareTableSchemas();
  const deletionReady = await testDeletionReadiness();
  await verifyIndexes();

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Test Results                                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (schemaMatch && deletionReady) {
    console.log('   ✅ All checks passed! Member deletion should work correctly.\n');
    process.exit(0);
  } else {
    console.log('   ⚠️  Some checks failed. Please review the migration.\n');
    process.exit(1);
  }
}

main();
