import emailjs from '@emailjs/browser';
import { stateLeadersService } from './supabase';

// EmailJS configuration
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

export interface WelcomeEmailData {
  full_name: string;
  email: string;
  mobile_number: string;
  state: string;
  referred_by?: string;
}

export const emailService = {
  // Initialize EmailJS
  init() {
    if (EMAILJS_PUBLIC_KEY) {
      emailjs.init(EMAILJS_PUBLIC_KEY);
    }
  },

  // Generate welcome email content with dynamic state leader
  async generateWelcomeMessage(data: WelcomeEmailData): Promise<string> {
    // Fetch state leader information
    const stateLeader = await stateLeadersService.getStateLeader(data.state);
    
    // Fallback values if state leader not found
    const presidentName = stateLeader?.president_name || 'State President';
    const presidentMobile = stateLeader?.president_mobile || '9848043392';
    
    const stateText = data.state === 'Andhra Pradesh' ? 'Andhra Pradesh' : data.state;
    const referredByLine = data.referred_by ? `\nReferred by: ${data.referred_by}` : '';
    
    return `Dear ${data.full_name},

Welcome to Laghu Udyog Bharati, ${stateText}!

We are delighted to inform you that your membership application has been approved. You are now officially part of the LUB family, and we look forward to supporting your business journey.

Mobile: ${data.mobile_number}${referredByLine}

As a member, you will have access to our comprehensive support programs, networking opportunities, and resources designed to help MSMEs thrive in today's competitive market.

We promise to make your membership experience as smooth as your business operations (and hopefully with fewer spreadsheets)!

Mobile: +91 ${presidentMobile}

Regards,
${presidentName}
State President
LUB, ${data.state}`;
  },

  // Send welcome email
  async sendWelcomeEmail(data: WelcomeEmailData): Promise<{ success: boolean; error?: string }> {
    try {
      if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
        throw new Error('EmailJS configuration is missing. Please check environment variables.');
      }

      const message = await this.generateWelcomeMessage(data);
      
      const templateParams = {
        to_name: data.full_name,
        to_email: data.email,
        subject: `Welcome to Laghu Udyog Bharati, ${data.state}!`,
        message: message,
        from_name: 'LUB Team',
        from_title: `Laghu Udyog Bharati, ${data.state}`
      };

      const response = await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams
      );

      if (response.status === 200) {
        return { success: true };
      } else {
        throw new Error(`EmailJS returned status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to send welcome email'
      };
    }
  }
};

// Initialize EmailJS when the module loads
emailService.init();