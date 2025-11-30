/**
 * Data Migration Script: Move Custom City Names to other_city_name Field
 *
 * This script identifies records in member_registrations where the city field
 * contains custom text (not from the approved cities list) and:
 * 1. Moves the custom city name to the other_city_name field
 * 2. Sets the city field to "Other"
 * 3. Logs all changes for audit trail
 *
 * Run this script after deploying the database migration that adds the other_city_name column.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing Supabase credentials in .env file');
  console.error('Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getApprovedCities() {
  console.log('Fetching approved cities from pending_cities_master...');

  const { data, error } = await supabase
    .from('pending_cities_master')
    .select('city_name')
    .eq('status', 'approved');

  if (error) {
    throw new Error(`Failed to fetch approved cities: ${error.message}`);
  }

  const cityNames = data.map(city => city.city_name.toLowerCase().trim());
  console.log(`Found ${cityNames.length} approved cities`);

  return new Set(cityNames);
}

async function findRecordsWithCustomCities(approvedCities) {
  console.log('\nFetching all member registrations...');

  const { data, error } = await supabase
    .from('member_registrations')
    .select('id, full_name, city, other_city_name, district, state');

  if (error) {
    throw new Error(`Failed to fetch member registrations: ${error.message}`);
  }

  console.log(`Analyzing ${data.length} records...`);

  const recordsToUpdate = [];

  for (const record of data) {
    // Skip if city is empty or already "Other"
    if (!record.city || record.city.trim() === '') continue;
    if (record.city === 'Other') continue;

    // Skip if other_city_name is already populated
    if (record.other_city_name && record.other_city_name.trim() !== '') continue;

    const cityLower = record.city.toLowerCase().trim();

    // Check if city is NOT in approved list
    if (!approvedCities.has(cityLower)) {
      recordsToUpdate.push({
        id: record.id,
        full_name: record.full_name,
        current_city: record.city,
        district: record.district,
        state: record.state
      });
    }
  }

  return recordsToUpdate;
}

async function migrateRecord(record) {
  const { error } = await supabase
    .from('member_registrations')
    .update({
      city: 'Other',
      other_city_name: record.current_city,
      last_modified_at: new Date().toISOString()
    })
    .eq('id', record.id);

  if (error) {
    throw new Error(`Failed to update record ${record.id}: ${error.message}`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Custom Cities Data Migration Script');
  console.log('='.repeat(60));
  console.log();

  try {
    // Step 1: Get approved cities list
    const approvedCities = await getApprovedCities();

    // Step 2: Find records with custom cities
    const recordsToUpdate = await findRecordsWithCustomCities(approvedCities);

    if (recordsToUpdate.length === 0) {
      console.log('\n✓ No records found with custom city names. Migration not needed.');
      return;
    }

    console.log(`\nFound ${recordsToUpdate.length} records with custom city names:`);
    console.log('-'.repeat(60));

    recordsToUpdate.forEach((record, index) => {
      console.log(`${index + 1}. ${record.full_name}`);
      console.log(`   Current City: "${record.current_city}"`);
      console.log(`   Location: ${record.district}, ${record.state}`);
      console.log(`   Will change to: city="Other", other_city_name="${record.current_city}"`);
      console.log();
    });

    console.log('-'.repeat(60));
    console.log('\nStarting migration...\n');

    // Step 3: Migrate records
    let successCount = 0;
    let errorCount = 0;

    for (const record of recordsToUpdate) {
      try {
        await migrateRecord(record);
        successCount++;
        console.log(`✓ Migrated: ${record.full_name} (${record.current_city})`);
      } catch (error) {
        errorCount++;
        console.error(`✗ Failed: ${record.full_name} - ${error.message}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total records processed: ${recordsToUpdate.length}`);
    console.log(`Successfully migrated: ${successCount}`);
    console.log(`Failed: ${errorCount}`);
    console.log('='.repeat(60));

    if (errorCount > 0) {
      console.log('\n⚠ Warning: Some records failed to migrate. Please review the errors above.');
      process.exit(1);
    } else {
      console.log('\n✓ Migration completed successfully!');
    }

  } catch (error) {
    console.error('\n✗ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the migration
main();
