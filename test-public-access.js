import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

console.log('🔍 Testing Public Access to Members Directory\n');
console.log('Supabase URL:', supabaseUrl);
console.log('Using ANON key (simulating public user)\n');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testPublicAccess() {
  try {
    console.log('📋 Test 1: Fetching approved members as anonymous user...');

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
      .limit(5);

    if (error) {
      console.error('❌ Error fetching members:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return false;
    }

    console.log(`✅ Successfully fetched ${data.length} members (Total approved: ${count})`);

    if (data.length > 0) {
      console.log('\n📄 Sample member data:');
      console.log('---');
      data.forEach((member, index) => {
        console.log(`${index + 1}. ${member.full_name} - ${member.company_name}`);
        console.log(`   Location: ${member.district}, ${member.city}, ${member.state}`);
        console.log(`   Status: ${member.status}`);
        console.log('---');
      });
    }

    return true;

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    return false;
  }
}

async function testRLSPolicies() {
  try {
    console.log('\n\n🔐 Test 2: Checking RLS policies on member_registrations table...');

    const { data, error } = await supabase
      .rpc('get_member_counts_by_state')
      .limit(5);

    if (error) {
      console.log('⚠️  Helper function test failed (this is optional):', error.message);
    } else {
      console.log('✅ Helper function works! Sample state counts:');
      data.forEach(row => {
        console.log(`   ${row.state_name}: ${row.member_count} members`);
      });
    }

  } catch (err) {
    console.log('⚠️  Helper function test skipped');
  }
}

async function testTotalCount() {
  try {
    console.log('\n\n📊 Test 3: Getting total count of approved members...');

    const { count, error } = await supabase
      .from('member_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved');

    if (error) {
      console.error('❌ Error getting count:', error);
      return;
    }

    console.log(`✅ Total approved members in database: ${count}`);

    if (count === 0) {
      console.log('\n⚠️  WARNING: No approved members found!');
      console.log('   This could mean:');
      console.log('   1. RLS policies are blocking access (most likely)');
      console.log('   2. No members have been approved yet');
      console.log('   3. The status column values are different (e.g., "Approved" vs "approved")');
    } else if (count === 144) {
      console.log('✅ Perfect! All 144 members are accessible to public users');
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

async function runAllTests() {
  console.log('=' .repeat(70));
  console.log('SUPABASE PUBLIC ACCESS TEST SUITE');
  console.log('=' .repeat(70));

  const publicAccessWorks = await testPublicAccess();
  await testRLSPolicies();
  await testTotalCount();

  console.log('\n' + '=' .repeat(70));
  if (publicAccessWorks) {
    console.log('✅ PUBLIC ACCESS IS WORKING CORRECTLY');
    console.log('   Anonymous users can view approved members');
  } else {
    console.log('❌ PUBLIC ACCESS IS BLOCKED');
    console.log('   RLS policies need to be fixed');
    console.log('\n💡 Solution: Apply the migration file:');
    console.log('   supabase/migrations/20251002190000_enable_public_directory_access.sql');
  }
  console.log('=' .repeat(70));
}

runAllTests();
