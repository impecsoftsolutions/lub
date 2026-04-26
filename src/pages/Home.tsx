import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Building2, TrendingUp, Award } from 'lucide-react';
import { useMember } from '../contexts/useMember';

const Home: React.FC = () => {
  const { isAuthenticated } = useMember();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center space-y-8">
            <h1 className="text-4xl md:text-6xl font-bold leading-tight">
              Empowering India's
              <span className="block text-orange-400 font-bold">MSMEs</span>
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 max-w-3xl mx-auto">
              Supporting Micro, Small and Medium Enterprises across India with comprehensive 
              development programs and industry connections.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {!isAuthenticated && (
                <Link
                  to="/signup"
                  className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold text-lg transition-colors duration-200 flex items-center justify-center"
                >
                  Member Registration
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Link>
              )}
              <Link
                to="/activities"
                className="border-2 border-white text-white hover:bg-white hover:text-blue-900 px-8 py-3 rounded-lg font-semibold text-lg transition-colors duration-200"
              >
                Explore Activities
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Why Choose LUB?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              We provide comprehensive support to help MSMEs thrive in today's competitive market.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center group">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Networking</h3>
              <p className="text-gray-600">Connect with industry leaders and fellow entrepreneurs</p>
            </div>
            
            <div className="text-center group">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors">
                <Building2 className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Resources</h3>
              <p className="text-gray-600">Access essential tools and resources for business growth</p>
            </div>
            
            <div className="text-center group">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors">
                <TrendingUp className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Growth</h3>
              <p className="text-gray-600">Accelerate your business with our development programs</p>
            </div>
            
            <div className="text-center group">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors">
                <Award className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Recognition</h3>
              <p className="text-gray-600">Get recognized for your contributions to the industry</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
