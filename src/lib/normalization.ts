import { aiSettingsService, supabase } from './supabase';

type NormalizationPayload = Record<string, unknown>;

export interface NormalizationResult {
  original: {
    full_name: string;
    email: string;
    mobile_number: string;
    company_name: string;
    company_address: string;
    products_services: string;
    alternate_contact_name: string;
    alternate_mobile: string;
    referred_by: string;
  };
  normalized: {
    full_name: string;
    email: string;
    mobile_number: string;
    company_name: string;
    company_address: string;
    products_services: string;
    alternate_contact_name: string;
    alternate_mobile: string;
    referred_by: string;
  };
}

export const normalizeMemberData = async (formData: NormalizationPayload): Promise<NormalizationResult> => {
  try {
    const runtimeProfile = await aiSettingsService.getRuntimeProfile();
    const requestBody = runtimeProfile
      ? { ...formData, _ai_runtime: runtimeProfile }
      : formData;

    const { data, error } = await supabase.functions.invoke('normalize-member', {
      body: requestBody
    });

    if (error) {
      throw new Error(`Failed to normalize data: ${error.message}`);
    }

    return data as NormalizationResult;
  } catch (error) {
    console.error('[normalizeMemberData] Error calling normalization function:', error);
    throw error;
  }
};
