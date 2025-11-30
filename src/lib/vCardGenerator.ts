export interface VCardData {
  fullName: string;
  companyName: string;
  mobileNumber: string;
  district: string;
  state: string;
  productsServices: string;
  referredBy?: string;
}

export const vCardGenerator = {
  // Generate a single vCard string
  generateVCard(data: VCardData): string {
    const {
      fullName,
      companyName,
      mobileNumber,
      district,
      state,
      productsServices,
      referredBy
    } = data;

    // Format the name as "LUB [State] - [Full Name]"
    const formattedName = `LUB ${state} - ${fullName}`;
    
    // Format mobile number with +91 prefix
    const formattedMobile = mobileNumber.startsWith('+91') 
      ? mobileNumber 
      : `+91${mobileNumber}`;

    // Create notes section
    let notes = `Products/Services: ${productsServices}`;
    if (referredBy) {
      notes += `\nReferred by: ${referredBy}`;
    }

    // Generate vCard content
    const vCardContent = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${formattedName}`,
      `N:;;;${formattedName};`,
      `ORG:${companyName}`,
      `TEL;TYPE=CELL:${formattedMobile}`,
      `ADR;TYPE=WORK:;;${district};${district};;${state};`,
      `NOTE:${notes}`,
      'END:VCARD'
    ].join('\r\n');

    return vCardContent;
  },

  // Generate filename for vCard
  generateFileName(fullName: string, state: string): string {
    const sanitizedName = fullName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const sanitizedState = state.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    return `LUB_${sanitizedState}_${sanitizedName}.vcf`;
  }
};