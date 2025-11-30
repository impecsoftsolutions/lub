import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://0ec90b57d6e95fcbda19832f.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJib2x0IiwicmVmIjoiMGVjOTBiNTdkNmU5NWZjYmRhMTk4MzJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4ODE1NzQsImV4cCI6MTc1ODg4MTU3NH0.9I8-U0x86Ak8t2DGaIk0HfvTSLsAyzdnz-Nw00mMkKw';

console.log('🔍 Testing Public Access to Members Directory\n');
console.log('Using ANON key (simulating public/logged-out user)\n');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testPublicAccess() {
  console.log('=' .repeat(70));
  console.log('TEST: Fetching approved members as anonymous user');
  console.log('=' .repeat(70));

  try {
    const { data, error, count } = await supabase
      .from('member_registrations')
      .select(`
        id,
        full_name,
        company_name,
        district,
        city,
        state,
        products_services,
        status
      `, { count: 'exact' })
      .eq('status', 'approved')
      .order('state')
      .order('full_name')
      .limit(10);

    if (error) {
      console.error('\n❌ ERROR: Cannot fetch members');
      console.error('Error Code:', error.code);
      console.error('Error Message:', error.message);
      console.error('Error Details:', error.details);
      console.error('Error Hint:', error.hint);

      console.log('\n🔧 DIAGNOSIS:');
      if (error.code === 'PGRST301' || error.message.includes('permission denied')) {
        console.log('   → RLS policies are blocking anonymous access');
        console.log('   → The migration has NOT been applied yet');
      } else if (error.code === '42P01') {
        console.log('   → Table does not exist or is not accessible');
      } else {
        console.log('   → Unknown error - see details above');
      }

      console.log('\n💡 SOLUTION:');
      console.log('   Apply this migration file to your Supabase database:');
      console.log('   → supabase/migrations/20251002190000_enable_public_directory_access.sql');
      console.log('\n   This will create the proper RLS policy to allow public access.');

      return false;
    }

    console.log(`\n✅ SUCCESS: Fetched ${data.length} members (Total approved: ${count || 'N/A'})`);

    if (count === 0) {
      console.log('\n⚠️  WARNING: Total count is 0');
      console.log('   Possible causes:');
      console.log('   1. RLS is blocking access (migration not applied)');
      console.log('   2. No members have been approved');
      console.log('   3. Status values are case-sensitive (check for "Approved" vs "approved")');
    } else if (count === 144) {
      console.log('\n🎉 PERFECT: All 144 members are accessible!');
    } else {
      console.log(`\n📊 Found ${count} approved members`);
    }

    if (data && data.length > 0) {
      console.log('\n📄 Sample Members:');
      console.log('-'.repeat(70));
      data.slice(0, 5).forEach((member, index) => {
        console.log(`${index + 1}. ${member.full_name}`);
        console.log(`   Company: ${member.company_name}`);
        console.log(`   Location: ${member.district}, ${member.city}, ${member.state}`);
        console.log(`   Status: ${member.status}`);
        console.log('-'.repeat(70));
      });
    }

    return true;

  } catch (err) {
    console.error('\n❌ UNEXPECTED ERROR:', err.message);
    console.error(err);
    return false;
  }
}

async function testDirectQuery() {
  console.log('\n\n' + '='.repeat(70));
  console.log('TEST: Direct query without status filter');
  console.log('=' .repeat(70));

  try {
    const { data, error, count } = await supabase
      .from('member_registrations')
      .select('id, full_name, status', { count: 'exact' })
      .limit(5);

    if (error) {
      console.error('\n❌ Cannot query table at all');
      console.error('Error:', error.message);
      console.log('\n   → RLS policies are completely blocking access');
      console.log('   → Migration MUST be applied');
      return false;
    }

    console.log(`\n✅ Can query table: ${count} total records found`);

    if (data && data.length > 0) {
      console.log('\nStatus values found in database:');
      const statuses = [...new Set(data.map(m => m.status))];
      statuses.forEach(status => {
        console.log(`   - "${status}"`);
      });
    }

    return true;

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    return false;
  }
}

async function runTests() {
  console.log('\n🏁 STARTING PUBLIC ACCESS TESTS\n');

  const test1 = await testPublicAccess();
  const test2 = await testDirectQuery();

  console.log('\n\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('=' .repeat(70));

  if (test1) {
    console.log('✅ Public access is WORKING');
    console.log('   Anonymous users can view the members directory');
  } else {
    console.log('❌ Public access is BLOCKED');
    console.log('   Migration file needs to be applied to Supabase');
    console.log('\n📋 NEXT STEPS:');
    console.log('   1. Go to your Supabase dashboard');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Open and run this migration:');
    console.log('      supabase/migrations/20251002190000_enable_public_directory_access.sql');
    console.log('   4. Re-run this test to verify');
  }
  console.log('=' .repeat(70));
}

runTests();
