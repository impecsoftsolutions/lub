import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://0ec90b57d6e95fcbda19832f.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJib2x0IiwicmVmIjoiMGVjOTBiNTdkNmU5NWZjYmRhMTk4MzJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4ODE1NzQsImV4cCI6MTc1ODg4MTU3NH0.9I8-U0x86Ak8t2DGaIk0HfvTSLsAyzdnz-Nw00mMkKw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyMigration() {
  console.log('Verifying profile_photo_url column migration...\n');

  console.log('1. Checking member_registrations table:');
  const { data: mrData, error: mrError } = await supabase
    .from('member_registrations')
    .select('profile_photo_url')
    .limit(1);

  if (mrError) {
    console.log('   ERROR:', mrError.message);
    return false;
  } else {
    console.log('   SUCCESS - profile_photo_url column exists');
  }

  console.log('\n2. Checking deleted_members table:');
  const { data: dmData, error: dmError } = await supabase
    .from('deleted_members')
    .select('profile_photo_url')
    .limit(1);

  if (dmError) {
    console.log('   ERROR:', dmError.message);
    return false;
  } else {
    console.log('   SUCCESS - profile_photo_url column exists');
  }

  console.log('\n3. Checking for existing profile photos:');
  const { data: photosData, error: photosError } = await supabase
    .from('member_registrations')
    .select('id, full_name, profile_photo_url')
    .not('profile_photo_url', 'is', null)
    .limit(5);

  if (photosError) {
    console.log('   ERROR:', photosError.message);
  } else if (photosData && photosData.length > 0) {
    console.log('   Found', photosData.length, 'member(s) with profile photos');
  } else {
    console.log('   No members have profile photos yet');
  }

  console.log('\nMigration verification complete!');
  return true;
}

verifyMigration().catch(console.error);
