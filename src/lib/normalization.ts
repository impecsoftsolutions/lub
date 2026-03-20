import { supabase } from './supabase';

type NormalizationPayload = Record<string, unknown>;

export interface NormalizationResult {
  original: NormalizationPayload;
  normalized: {
    full_name: string;
    email: string;
    mobile_number: string;
    company_name: string;
    company_address: string;
    products_services: string;         // ⬅ NEW
    alternate_contact_name: string;
    alternate_mobile: string;
    referred_by: string;
  };
}

export const normalizeMemberData = async (formData: NormalizationPayload): Promise<NormalizationResult> => {
  try {
    console.log('🚀 Calling Edge Function with:', formData);
    
    // Call your Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('normalize-member', {
      body: formData
    });

    console.log('📥 Edge Function returned - data:', data);
    console.log('📥 Edge Function returned - error:', error);

    console.log('[normalizeMemberData] Response keys:', Object.keys(data || {}));
    console.log('[normalizeMemberData] Has original/normalized:', !!data?.original, !!data?.normalized);

    if (error) {
      console.error('❌ Normalization error:', error);
      throw new Error(`Failed to normalize data: ${error.message}`);
    }

    console.log('✅ Returning result:', data);
    return data as NormalizationResult;
  } catch (error) {
    console.error('❌ Error calling normalization function:', error);
    throw error;
  }
};
