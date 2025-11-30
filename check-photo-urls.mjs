import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read .env file
const envContent = readFileSync('/tmp/cc-agent/57547668/project/.env', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPhotoUrls() {
  console.log('Checking for members with profile photo URLs...\n');

  const { data: members, error } = await supabase
    .from('member_registrations')
    .select('id, full_name, profile_photo_url')
    .not('profile_photo_url', 'is', null);

  if (error) {
    console.error('Error fetching members:', error);
    return;
  }

  if (!members || members.length === 0) {
    console.log('✓ No members have profile photos yet. Ready for testing!');
    return;
  }

  console.log(`Found ${members.length} member(s) with profile photo URLs:\n`);
  
  for (const member of members) {
    console.log(`- ${member.full_name}`);
    console.log(`  ID: ${member.id}`);
    console.log(`  Photo URL: ${member.profile_photo_url}`);
    console.log('');
  }

  console.log('\nNote: These URLs may be broken if they were uploaded before the bucket was created.');
  console.log('You can test by trying to access the URLs in a browser.');
}

checkPhotoUrls();
