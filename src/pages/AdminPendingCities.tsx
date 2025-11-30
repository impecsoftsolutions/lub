import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Check, X, CreditCard as Edit2, GitMerge, AlertCircle, MapPin, ArrowLeft, Lock } from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';

interface PendingCity {
  id: string;
  city_name: string;
  district_id: string;
  state_id: string;
  status: 'pending' | 'approved' | 'rejected';
  submission_source: string;
  submitted_by: string | null;
  notes: string | null;
  created_at: string;
  district?: {
    district_name: string;
  };
  state?: {
    state_name: string;
  };
}

interface City {
  id: string;
  city_name: string;
  district_id: string;
  district?: {
    district_name: string;
  };
}

export default function AdminPendingCities() {
  const canViewCities = useHasPermission('locations.cities.view');
  const canApprovePending = useHasPermission('locations.cities.approve_pending');
  const navigate = useNavigate();
  const [pendingCities, setPendingCities] = useState<PendingCity[]>([]);
  const [approvedCities, setApprovedCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCity, setSelectedCity] = useState<PendingCity | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [editedCityName, setEditedCityName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        supabase
          .from('pending_cities_master')
          .select(`
            *,
            district:districts_master(district_name),
            state:states_master(state_name)
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('pending_cities_master')
          .select(`
            id,
            city_name,
            district_id,
            district:districts_master(district_name)
          `)
          .eq('status', 'approved')
          .order('city_name')
      ]);

      if (pendingRes.data) setPendingCities(pendingRes.data);
      if (approvedRes.data) setApprovedCities(approvedRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(cityId: string) {
    const { error } = await supabase
      .from('pending_cities_master')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', cityId);

    if (error) {
      console.error('Error approving city:', error);
      alert('Error approving city: ' + error.message);
      return;
    }

    fetchData();
  }

  async function handleReject() {
    if (!selectedCity || !rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    const { error } = await supabase
      .from('pending_cities_master')
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', selectedCity.id);

    if (error) {
      console.error('Error rejecting city:', error);
      alert('Error rejecting city: ' + error.message);
      return;
    }

    setShowRejectModal(false);
    setSelectedCity(null);
    setRejectionReason('');
    fetchData();
  }

  async function handleMerge() {
    if (!selectedCity || !mergeTargetId) {
      alert('Please select a city to merge into');
      return;
    }

    const { error } = await supabase
      .from('pending_cities_master')
      .update({
        status: 'rejected',
        merged_into_city_id: mergeTargetId,
        rejection_reason: 'Merged into existing city',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', selectedCity.id);

    if (error) {
      console.error('Error merging city:', error);
      alert('Error merging city: ' + error.message);
      return;
    }

    setShowMergeModal(false);
    setSelectedCity(null);
    setMergeTargetId('');
    fetchData();
  }

  async function handleEdit() {
    if (!selectedCity || !editedCityName.trim()) {
      alert('Please provide a city name');
      return;
    }

    const { error } = await supabase
      .from('pending_cities_master')
      .update({
        city_name: editedCityName.trim(),
        status: 'approved',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', selectedCity.id);

    if (error) {
      console.error('Error updating city:', error);
      alert('Error updating city: ' + error.message);
      return;
    }

    setShowEditModal(false);
    setSelectedCity(null);
    setEditedCityName('');
    fetchData();
  }

  const getSimilarCities = (cityName: string, districtId: string) => {
    return approvedCities.filter(
      city =>
        city.district_id === districtId &&
        (city.city_name.toLowerCase().includes(cityName.toLowerCase()) ||
          cityName.toLowerCase().includes(city.city_name.toLowerCase()))
    );
  };

  return (
    <PermissionGate
      permission="locations.cities.view"
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to view pending cities.</p>
          </div>
        </div>
      }
    >
      <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Pending Cities Review</h1>
          <p className="mt-2 text-gray-600">
            Review and approve cities submitted through registration forms
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading pending cities...</p>
          </div>
        ) : pendingCities.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Cities</h3>
            <p className="text-gray-600">
              All submitted cities have been reviewed. New submissions will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingCities.map((city) => {
              const similarCities = getSimilarCities(city.city_name, city.district_id);

              return (
                <div
                  key={city.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {city.city_name}
                        </h3>
                        <span className="px-2.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                          Pending Review
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">District:</span>{' '}
                          {city.district?.district_name || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">State:</span>{' '}
                          {city.state?.state_name || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Source:</span>{' '}
                          {city.submission_source.replace('_', ' ')}
                        </div>
                        <div>
                          <span className="font-medium">Submitted:</span>{' '}
                          {new Date(city.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      {city.notes && (
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">Notes:</span> {city.notes}
                          </p>
                        </div>
                      )}

                      {similarCities.length > 0 && (
                        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-amber-900 mb-1">
                                Similar cities found in {city.district?.district_name}:
                              </p>
                              <ul className="text-sm text-amber-800 space-y-1">
                                {similarCities.map((similar) => (
                                  <li key={similar.id}>• {similar.city_name}</li>
                                ))}
                              </ul>
                              <p className="text-xs text-amber-700 mt-2">
                                Consider merging if this is a duplicate
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {canApprovePending && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => handleApprove(city.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </button>

                      <button
                        onClick={() => {
                          setSelectedCity(city);
                          setEditedCityName(city.city_name);
                          setShowEditModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit & Approve
                      </button>

                      {similarCities.length > 0 && (
                        <button
                          onClick={() => {
                            setSelectedCity(city);
                            setShowMergeModal(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                        >
                          <GitMerge className="w-4 h-4" />
                          Merge
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setSelectedCity(city);
                          setShowRejectModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showEditModal && selectedCity && canApprovePending && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Edit & Approve City</h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City Name *
                  </label>
                  <input
                    type="text"
                    value={editedCityName}
                    onChange={(e) => setEditedCityName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter corrected city name"
                  />
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">District:</span>{' '}
                    {selectedCity.district?.district_name}
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-lg">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedCity(null);
                    setEditedCityName('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEdit}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save & Approve
                </button>
              </div>
            </div>
          </div>
        )}

        {showMergeModal && selectedCity && canApprovePending && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Merge City</h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <p className="text-sm text-gray-600">
                  Merge "{selectedCity.city_name}" into an existing approved city:
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Target City *
                  </label>
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Choose a city...</option>
                    {getSimilarCities(selectedCity.city_name, selectedCity.district_id).map(
                      (city) => (
                        <option key={city.id} value={city.id}>
                          {city.city_name} ({city.district?.district_name})
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg">
                  <p className="text-xs text-amber-800">
                    The pending city will be marked as rejected and linked to the selected
                    approved city.
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-lg">
                <button
                  onClick={() => {
                    setShowMergeModal(false);
                    setSelectedCity(null);
                    setMergeTargetId('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMerge}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                >
                  Merge Cities
                </button>
              </div>
            </div>
          </div>
        )}

        {showRejectModal && selectedCity && canApprovePending && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Reject City</h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <p className="text-sm text-gray-600">
                  Rejecting "{selectedCity.city_name}"
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rejection Reason *
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Explain why this city is being rejected..."
                  />
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-lg">
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setSelectedCity(null);
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Reject City
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </PermissionGate>
  );
}
