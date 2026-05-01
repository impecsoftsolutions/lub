import React from 'react';
import { Link } from 'react-router-dom';
import {
  Megaphone,
  Users,
  GraduationCap,
  FileText,
  Wallet,
  Award,
  ArrowRight
} from 'lucide-react';

const MembershipBenefits: React.FC = () => {
  const benefits = [
    {
      icon: Megaphone,
      title: 'Voice & Advocacy',
      color: 'bg-primary/10 text-primary',
      borderColor: 'border-border',
      items: [
        'Strong representation at local, national and international levels',
        "India's largest organization for MSMEs",
        'Influence policies and regulations that shape your business environment',
        'Active role in simplifying regulations and reducing compliance burdens'
      ]
    },
    {
      icon: Users,
      title: 'Networking & Business Growth',
      color: 'bg-primary/10 text-primary',
      borderColor: 'border-border',
      items: [
        'Connect with MSME owners and entrepreneurs across India',
        'Access to industry leaders and potential clients',
        'Platform for collaborations and partnerships',
        'Opportunities in international trade fairs and exhibitions',
        'Expand your business globally through business delegations'
      ]
    },
    {
      icon: GraduationCap,
      title: 'Training & Skill Development',
      color: 'bg-primary/10 text-primary',
      borderColor: 'border-border',
      items: [
        'Regular workshops, seminars and training programmes',
        'Focus on skill development and technology adoption',
        'Stay updated with emerging business trends',
        'Continuous learning to stay competitive',
        'Professional development and certifications'
      ]
    },
    {
      icon: FileText,
      title: 'Resources & Support',
      color: 'bg-primary/10 text-primary',
      borderColor: 'border-border',
      items: [
        'Industry reports and market insights',
        'Information on government schemes and subsidies for MSMEs',
        'Guidance on applying for benefits and resources',
        'Legal advice and export-import guidance',
        'Quality management systems support',
        'Critical support during times of crisis or uncertainty'
      ]
    },
    {
      icon: Wallet,
      title: 'Cost Savings & Benefits',
      color: 'bg-primary/10 text-primary',
      borderColor: 'border-border',
      items: [
        'Collective bargaining power for better deals',
        'Negotiate with suppliers, credit facilities and service providers',
        'Exclusive discounts on products and services',
        'Direct cost savings for members'
      ]
    },
    {
      icon: Award,
      title: 'Recognition & Innovation',
      color: 'bg-primary/10 text-primary',
      borderColor: 'border-border',
      items: [
        'Enhanced business credibility and visibility',
        'Showcase achievements through association events',
        'Platform for sharing knowledge and best practices',
        'Participate in industrial exhibitions',
        'Recognition as a committed, nation-building enterprise'
      ]
    }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-10 sm:py-14 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-4">Membership Benefits</h1>
            <p className="text-lg leading-8 sm:text-xl md:text-2xl text-blue-100">
              Why join Laghu Udyog Bharati - Empowering MSMEs across India
            </p>
          </div>
        </div>
      </div>

      {/* Benefits Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-8">
          {benefits.map((benefit, index) => {
            const IconComponent = benefit.icon;
            return (
              <div
                key={index}
                className={`bg-card rounded-lg shadow-md border-2 ${benefit.borderColor} hover:shadow-xl transition-shadow duration-300`}
              >
                <div className={`${benefit.color} rounded-t-lg p-4 sm:p-6 flex items-center gap-4`}>
                  <div className="flex-shrink-0">
                    <IconComponent className="w-8 h-8" />
                  </div>
                  <h2 className="text-section font-semibold text-foreground">{benefit.title}</h2>
                </div>
                <div className="p-4 sm:p-6">
                  <ul className="space-y-2 sm:space-y-3">
                    {benefit.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="flex items-start gap-3">
                        <span className="text-primary font-medium mt-0.5">•</span>
                        <span className="text-foreground text-base leading-6 sm:text-lg sm:leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* Call to Action */}
        <div className="mt-10 sm:mt-16 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-xl p-6 sm:p-8 md:p-12 text-center">
          <h2 className="text-2xl font-semibold text-white mb-4">
            Ready to Join?
          </h2>
          <p className="text-lg leading-8 sm:text-xl text-blue-100 mb-6 sm:mb-8 max-w-2xl mx-auto">
            Become a member of India's largest MSME organization and unlock these exclusive benefits for your business growth
          </p>
          <Link
            to="/signup"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-white text-primary px-8 py-4 rounded-lg text-base sm:text-lg font-semibold hover:bg-primary/10 transition-colors duration-200 shadow-lg hover:shadow-xl"
          >
            Register Now
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default MembershipBenefits;
