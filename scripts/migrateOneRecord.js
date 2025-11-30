```javascript
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

// Ensure environment variables are loaded
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.');
  process.exit(1);
}

// Initialize Supabase client with service_role key for admin operations
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false // No session persistence needed for a script
  }
});

async function migrateOneRecord() {
  console.log('Starting single record migration...');

  try {
    // 1. Fetch one record from staging.jotform_members_raw
    const { data: stagingRecords, error: fetchError } = await supabaseAdmin
      .from('jotform_members_raw')
      .select('*')
      .limit(1)
      .order('id', { ascending: true }) // Assuming 'id' exists and is sortable
      .schema('staging'); // Specify the staging schema

    if (fetchError) {
      throw new Error(\`Failed to fetch from staging: ${fetchError.message}`);
    }
    if (!stagingRecords || stagingRecords.length === 0) {
      console.log('No records found in staging.jotform_members_raw to migrate.');
      return;
    }

    const stagingRecord = stagingRecords[0];
    console.log('Fetched staging record:', stagingRecord);

    // 2. Map fields to public.member_registrations schema
    //    Assumptions:
    //    - Staging column names largely match production column names.
    //    - Placeholder values are used for fields not explicitly mapped or found.
    //    - 'date_of_birth' and 'payment_date' are expected in 'YYYY-MM-DD' format from staging.
    const newMemberRegistration = {
      full_name: stagingRecord.full_name || 'N/A',
      gender: stagingRecord.gender || 'male', // Default to 'male' if not present
      date_of_birth: stagingRecord.date_of_birth || '1970-01-01', // Default date if not present
      email: stagingRecord.email || 'placeholder@example.com',
      mobile_number: stagingRecord.mobile_number || '0000000000',
      company_name: stagingRecord.company_name || 'N/A',
      designation: stagingRecord.designation || 'Owner', // Default designation
      company_address: stagingRecord.company_address || 'N/A',
      city: stagingRecord.city || 'N/A',
      district: stagingRecord.district || 'N/A',
      state: stagingRecord.state || 'N/A',
      pin_code: stagingRecord.pin_code || '000000',
      industry: stagingRecord.industry || 'Manufacturing', // Default industry
      activity_type: stagingRecord.activity_type || 'Production', // Default activity type
      constitution: stagingRecord.constitution || 'Proprietorship', // Default constitution
      annual_turnover: stagingRecord.annual_turnover || 'Less than 1 Cr', // Default turnover
      number_of_employees: stagingRecord.number_of_employees || '1-10', // Default employees
      products_services: stagingRecord.products_services || 'Not specified',
      brand_names: stagingRecord.brand_names || '',
      website: stagingRecord.website || '',
      gst_registered: stagingRecord.gst_registered || 'no', // Default to 'no'
      gst_number: stagingRecord.gst_number || '',
      pan_company: stagingRecord.pan_company || 'N/A',
      esic_registered: stagingRecord.esic_registered || 'no', // Default to 'no'
      epf_registered: stagingRecord.epf_registered || 'no', // Default to 'no'
      gst_certificate_url: '', // As per requirement
      udyam_certificate_url: '', // As per requirement
      payment_proof_url: '', // As per requirement
      referred_by: stagingRecord.referred_by || '',
      amount_paid: stagingRecord.amount_paid || '0',
      payment_date: stagingRecord.payment_date || '1970-01-01', // Default date if not present
      payment_mode: stagingRecord.payment_mode || 'Online', // Default payment mode
      transaction_id: stagingRecord.transaction_id || '',
      bank_reference: stagingRecord.bank_reference || '',
      alternate_contact_name: stagingRecord.alternate_contact_name || '',
      alternate_mobile: stagingRecord.alternate_mobile || '',
      status: 'approved', // As per requirement
      // id, created_at, updated_at, slug are handled by database defaults/triggers
      company_designation_id: stagingRecord.company_designation_id || null, // Nullable
    };

    // 3. Insert the mapped record into public.member_registrations
    const { data: insertedRecord, error: insertError } = await supabaseAdmin
      .from('member_registrations')
      .insert([newMemberRegistration])
      .select(); // Select the inserted record to confirm

    if (insertError) {
      throw new Error(\`Failed to insert into public.member_registrations: ${insertError.message}`);
    }

    console.log('Successfully migrated one record to public.member_registrations:');
    console.log(insertedRecord[0]);

  } catch (error) {
    console.error('Migration failed:', error.message);
  } finally {
    console.log('Migration process finished.');
  }
}

migrateOneRecord();
```