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
      color: 'bg-blue-50 text-blue-600',
      borderColor: 'border-gray-200',
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
      color: 'bg-blue-50 text-blue-600',
      borderColor: 'border-gray-200',
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
      color: 'bg-blue-50 text-blue-600',
      borderColor: 'border-gray-200',
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
      color: 'bg-blue-50 text-blue-600',
      borderColor: 'border-gray-200',
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
      color: 'bg-blue-50 text-blue-600',
      borderColor: 'border-gray-200',
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
      color: 'bg-blue-50 text-blue-600',
      borderColor: 'border-gray-200',
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
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Membership Benefits</h1>
            <p className="text-xl md:text-2xl text-blue-100">
              Why join Laghu Udyog Bharati - Empowering MSMEs across India
            </p>
          </div>
        </div>
      </div>

      {/* Benefits Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {benefits.map((benefit, index) => {
            const IconComponent = benefit.icon;
            return (
              <div
                key={index}
                className={`bg-white rounded-xl shadow-md border-2 ${benefit.borderColor} hover:shadow-xl transition-shadow duration-300`}
              >
                <div className={`${benefit.color} rounded-t-xl p-6 flex items-center gap-4`}>
                  <div className="flex-shrink-0">
                    <IconComponent className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">{benefit.title}</h2>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    {benefit.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="flex items-start gap-3">
                        <span className="text-blue-600 font-bold mt-0.5">•</span>
                        <span className="text-gray-700 text-lg leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* Call to Action */}
        <div className="mt-16 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-xl p-8 md:p-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Join?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Become a member of India's largest MSME organization and unlock these exclusive benefits for your business growth
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 bg-white text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition-colors duration-200 shadow-lg hover:shadow-xl"
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
