import React from 'react';

const Styleguide: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="space-y-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Style Guide</h1>
          <p className="text-xl text-gray-600">LUB brand colors, typography, and components</p>
        </div>

        {/* Colors */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Brand Colors</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="w-full h-20 bg-blue-900 rounded-lg mb-2"></div>
              <p className="text-sm font-medium">Primary Blue</p>
              <p className="text-xs text-gray-600">#1e3a8a</p>
            </div>
            <div className="text-center">
              <div className="w-full h-20 bg-blue-600 rounded-lg mb-2"></div>
              <p className="text-sm font-medium">Accent Blue</p>
              <p className="text-xs text-gray-600">#2563eb</p>
            </div>
            <div className="text-center">
              <div className="w-full h-20 bg-orange-500 rounded-lg mb-2"></div>
              <p className="text-sm font-medium">Saffron</p>
              <p className="text-xs text-gray-600">#f97316</p>
            </div>
            <div className="text-center">
              <div className="w-full h-20 bg-gray-100 rounded-lg mb-2 border"></div>
              <p className="text-sm font-medium">Light Gray</p>
              <p className="text-xs text-gray-600">#f3f4f6</p>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Typography</h2>
          <div className="space-y-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Heading 1</h1>
              <p className="text-sm text-gray-600">text-4xl font-bold</p>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Heading 2</h2>
              <p className="text-sm text-gray-600">text-2xl font-bold</p>
            </div>
            <div>
              <p className="text-base text-gray-700">Body text - Regular paragraph with normal weight</p>
              <p className="text-sm text-gray-600">text-base</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Styleguide;