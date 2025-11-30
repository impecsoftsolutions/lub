import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPhotoUrls() {
  console.log('Checking for members with profile photo URLs...\n');

  // Get all members with profile_photo_url
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
