import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://0ec90b57d6e95fcbda19832f.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJib2x0IiwicmVmIjoiMGVjOTBiNTdkNmU5NWZjYmRhMTk4MzJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4ODE1NzQsImV4cCI6MTc1ODg4MTU3NH0.9I8-U0x86Ak8t2DGaIk0HfvTSLsAyzdnz-Nw00mMkKw';

console.log('🧪 Testing Directory Query\n');
console.log('=' .repeat(70));

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testBasicQuery() {
  console.log('\n📋 Test 1: Basic query without JOIN');
  console.log('-'.repeat(70));

  try {
    const { data, error, count } = await supabase
      .from('member_registrations')
      .select('id, full_name, company_name, status', { count: 'exact' })
      .eq('status', 'approved')
      .limit(3);

    if (error) {
      console.error('❌ Error:', error.message);
      console.error('Code:', error.code);
      console.error('Details:', error.details);
      console.error('Hint:', error.hint);
      return false;
    }

    console.log('✅ Success!');
    console.log(`   Fetched: ${data.length} members`);
    console.log(`   Total: ${count} approved members`);

    if (data.length > 0) {
      console.log('\n   Sample data:');
      data.forEach(m => console.log(`   - ${m.full_name} (${m.company_name})`));
    }

    return true;
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    return false;
  }
}

async function testQueryWithInnerJoin() {
  console.log('\n📋 Test 2: Query with INNER JOIN on company_designations');
  console.log('-'.repeat(70));

  try {
    const { data, error, count } = await supabase
      .from('member_registrations')
      .select(`
        id,
        full_name,
        company_name,
        company_designation_id,
        company_designations(designation_name)
      `, { count: 'exact' })
      .eq('status', 'approved')
      .limit(3);

    if (error) {
      console.error('❌ Error with INNER JOIN:', error.message);
      console.error('Code:', error.code);
      console.error('Details:', error.details);
      return false;
    }

    console.log('✅ Success with INNER JOIN!');
    console.log(`   Fetched: ${data.length} members`);
    console.log(`   Total: ${count} members with designations`);

    if (data.length > 0) {
      console.log('\n   Sample data:');
      data.forEach(m => {
        console.log(`   - ${m.full_name}: ${m.company_designations?.designation_name || 'No designation'}`);
      });
    }

    return true;
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    return false;
  }
}

async function testQueryWithLeftJoin() {
  console.log('\n📋 Test 3: Query with LEFT JOIN on company_designations');
  console.log('-'.repeat(70));

  try {
    const { data, error, count } = await supabase
      .from('member_registrations')
      .select(`
        id,
        full_name,
        company_name,
        company_designation_id,
        company_designations!left(designation_name)
      `, { count: 'exact' })
      .eq('status', 'approved')
      .limit(3);

    if (error) {
      console.error('❌ Error with LEFT JOIN:', error.message);
      console.error('Code:', error.code);
      console.error('Details:', error.details);
      console.error('Hint:', error.hint);
      return false;
    }

    console.log('✅ Success with LEFT JOIN!');
    console.log(`   Fetched: ${data.length} members`);
    console.log(`   Total: ${count} approved members (including null designations)`);

    if (data.length > 0) {
      console.log('\n   Sample data:');
      data.forEach(m => {
        const designation = m.company_designations?.designation_name || 'NULL';
        console.log(`   - ${m.full_name}: ${designation}`);
      });
    }

    return true;
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    return false;
  }
}

async function testFullDirectoryQuery() {
  console.log('\n📋 Test 4: Full Directory Query (as used in component)');
  console.log('-'.repeat(70));

  try {
    const { data, error } = await supabase
      .from('member_registrations')
      .select(`
        id,
        full_name,
        email,
        mobile_number,
        company_name,
        company_designation_id,
        company_designations!left(designation_name),
        company_address,
        city,
        district,
        state,
        products_services,
        website,
        gst_certificate_url,
        udyam_certificate_url,
        payment_proof_url,
        created_at
      `)
      .eq('status', 'approved')
      .order('state', { ascending: true })
      .order('full_name', { ascending: true })
      .limit(5);

    if (error) {
      console.error('❌ Error with full query:', error.message);
      console.error('Code:', error.code);
      console.error('Details:', error.details);
      console.error('Hint:', error.hint);
      return false;
    }

    console.log('✅ Success with full query!');
    console.log(`   Fetched: ${data.length} members with all fields`);

    if (data.length > 0) {
      console.log('\n   Sample member:');
      const m = data[0];
      console.log(`   Name: ${m.full_name}`);
      console.log(`   Company: ${m.company_name}`);
      console.log(`   Designation: ${m.company_designations?.designation_name || 'None'}`);
      console.log(`   Location: ${m.district}, ${m.city}, ${m.state}`);
      console.log(`   Email: ${m.email}`);
      console.log(`   Phone: ${m.mobile_number}`);
      console.log(`   Products: ${m.products_services?.substring(0, 50)}...`);
    }

    return true;
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    return false;
  }
}

async function checkDesignationTableAccess() {
  console.log('\n📋 Test 5: Check company_designations table access');
  console.log('-'.repeat(70));

  try {
    const { data, error, count } = await supabase
      .from('company_designations')
      .select('id, designation_name', { count: 'exact' })
      .limit(5);

    if (error) {
      console.error('❌ Cannot access company_designations table');
      console.error('Error:', error.message);
      console.error('Code:', error.code);
      console.log('\n⚠️  This table might have RLS blocking anonymous access');
      console.log('   Solution: Add RLS policy to allow public read access to company_designations');
      return false;
    }

    console.log('✅ Can access company_designations table');
    console.log(`   Total designations: ${count}`);

    if (data && data.length > 0) {
      console.log('\n   Available designations:');
      data.forEach(d => console.log(`   - ${d.designation_name}`));
    }

    return true;
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    return false;
  }
}

async function checkMemberDesignationReferences() {
  console.log('\n📋 Test 6: Check for orphaned designation references');
  console.log('-'.repeat(70));

  try {
    const { data: members, error } = await supabase
      .from('member_registrations')
      .select('id, full_name, company_designation_id')
      .eq('status', 'approved')
      .not('company_designation_id', 'is', null);

    if (error) {
      console.error('❌ Error:', error.message);
      return false;
    }

    console.log(`✅ Found ${members.length} members with company_designation_id set`);

    if (members.length > 0) {
      const designationIds = members.map(m => m.company_designation_id);
      const uniqueIds = [...new Set(designationIds)];
      console.log(`   Unique designation IDs referenced: ${uniqueIds.length}`);
    }

    return true;
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    return false;
  }
}

async function runAllTests() {
  console.log('DIRECTORY QUERY DIAGNOSTICS');
  console.log('=' .repeat(70));

  const results = {
    basicQuery: await testBasicQuery(),
    innerJoin: await testQueryWithInnerJoin(),
    leftJoin: await testQueryWithLeftJoin(),
    fullQuery: await testFullDirectoryQuery(),
    designationAccess: await checkDesignationTableAccess(),
    orphanedRefs: await checkMemberDesignationReferences()
  };

  console.log('\n\n' + '=' .repeat(70));
  console.log('SUMMARY');
  console.log('=' .repeat(70));

  const allPassed = Object.values(results).every(r => r === true);

  if (allPassed) {
    console.log('✅ ALL TESTS PASSED');
    console.log('   The directory query should work correctly');
  } else {
    console.log('❌ SOME TESTS FAILED\n');

    if (!results.basicQuery) {
      console.log('❌ Basic query failed');
      console.log('   → RLS policies are blocking access to member_registrations');
      console.log('   → Ensure migration 20251002190000_enable_public_directory_access.sql is applied');
    }

    if (!results.designationAccess) {
      console.log('\n❌ Cannot access company_designations table');
      console.log('   → RLS policies are blocking access to company_designations');
      console.log('   → Need to add public read policy for company_designations table');
    }

    if (results.basicQuery && !results.innerJoin && results.leftJoin) {
      console.log('\n⚠️  INNER JOIN fails but LEFT JOIN works');
      console.log('   → Some members have invalid company_designation_id references');
      console.log('   → Use LEFT JOIN (already implemented in the fix)');
    }

    if (!results.fullQuery) {
      console.log('\n❌ Full directory query failed');
      console.log('   → Check error details above for specific issue');
    }
  }

  console.log('=' .repeat(70));
}

runAllTests();
