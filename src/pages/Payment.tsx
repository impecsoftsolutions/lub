import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Banknote, QrCode, AlertCircle, MapPin } from 'lucide-react';
import { statesService, PublicPaymentState } from '../lib/supabase';

const Payment: React.FC = () => {
  const [allActiveStates, setAllActiveStates] = useState<PublicPaymentState[]>([]);
  const [selectedStateName, setSelectedStateName] = useState<string>('');
  const [displayedPaymentDetails, setDisplayedPaymentDetails] = useState<PublicPaymentState | null>(null);
  const [isLoadingStates, setIsLoadingStates] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Load all active states and handle URL parameter
  useEffect(() => {
    const loadActiveStates = async () => {
      try {
        setIsLoadingStates(true);
        const states = await statesService.getPublicPaymentStates();
        
        // Sort states alphabetically
        const sortedStates = states.sort((a, b) =>
          a.state.localeCompare(b.state)
        );
        setAllActiveStates(sortedStates);

        // Check for state parameter in URL
        const stateParam = searchParams.get('state');
        if (stateParam) {
          const trimmedParam = stateParam.trim();
          const matchingState = sortedStates.find(
            state => state.state.toLowerCase() === trimmedParam.toLowerCase()
          );

          if (matchingState) {
            setSelectedStateName(matchingState.state);
            setErrorMessage(null);
          } else {
            setErrorMessage(`No payment settings found for '${trimmedParam}'. Please choose your state.`);
            setSelectedStateName('');
          }
        }
      } catch (error) {
        console.error('Error loading active states:', error);
        setErrorMessage('Failed to load payment information. Please try again.');
      } finally {
        setIsLoadingStates(false);
      }
    };

    loadActiveStates();
  }, [searchParams]);

  // Load payment details when selectedStateName changes
  useEffect(() => {
    const loadPaymentDetails = async () => {
      if (!selectedStateName) {
        setDisplayedPaymentDetails(null);
        setErrorMessage(null);
        return;
      }

      try {
        setIsLoadingDetails(true);
        setDisplayedPaymentDetails(null); // Clear previous details to prevent flashing
        
        const details = await statesService.getPublicPaymentStateByName(selectedStateName);
        
        if (details) {
          setDisplayedPaymentDetails(details);
          setErrorMessage(null);
        } else {
          setErrorMessage(`No payment settings found for '${selectedStateName}'. Please choose your state.`);
          setDisplayedPaymentDetails(null);
        }
      } catch (error) {
        console.error('Error loading payment details:', error);
        setErrorMessage('Failed to load payment details. Please try again.');
        setDisplayedPaymentDetails(null);
      } finally {
        setIsLoadingDetails(false);
      }
    };

    loadPaymentDetails();
  }, [selectedStateName]);

  const handleStateSelect = (stateName: string) => {
    setSelectedStateName(stateName);
    
    // Update URL parameter
    if (stateName) {
      navigate(`/payment?state=${encodeURIComponent(stateName)}`);
    } else {
      navigate('/payment');
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-card rounded-lg shadow-sm border border-border p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-xl font-semibold text-foreground mb-2">LUB Membership Payment</h1>
            <p className="text-muted-foreground">Select your state to view payment details and fees.</p>
          </div>

          {/* Error Message Banner */}
          {errorMessage && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-destructive mr-2" />
                <p className="text-destructive">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* State Selection Dropdown */}
          <div className="mb-8">
            <label htmlFor="state-select" className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Select your state <span className="text-red-500">*</span>
            </label>
            {isLoadingStates ? (
              <div className="animate-pulse">
                <div className="h-12 bg-muted rounded-lg"></div>
              </div>
            ) : allActiveStates.length === 0 ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
                <AlertCircle className="w-12 h-12 text-destructive/70 mx-auto mb-4" />
                <h3 className="text-section font-semibold text-foreground mb-2">No Active States Available</h3>
                <p className="text-muted-foreground">Please contact admin for assistance.</p>
              </div>
            ) : (
              <select
                id="state-select"
                value={selectedStateName}
                onChange={(e) => handleStateSelect(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded-lg focus:ring-1 focus:ring-ring focus:border-ring text-foreground bg-background"
              >
                <option value="">Select your state</option>
                {allActiveStates.map((state) => (
                  <option key={state.state} value={state.state}>
                    {state.state}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Payment Details Panel */}
          {(isLoadingDetails || displayedPaymentDetails) && (
            <div className="space-y-8">
              {isLoadingDetails ? (
                <div className="animate-pulse space-y-6">
                  <div className="h-8 bg-muted rounded w-1/3"></div>
                  <div className="bg-muted/50 rounded-lg p-6 space-y-4">
                    <div className="h-6 bg-muted rounded w-1/4"></div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="h-20 bg-gray-200 rounded"></div>
                      <div className="h-20 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-6 space-y-4">
                    <div className="h-6 bg-muted rounded w-1/4"></div>
                    <div className="h-48 bg-muted rounded w-48 mx-auto"></div>
                  </div>
                </div>
              ) : displayedPaymentDetails && (
                <div className="space-y-8">
                  <div className="bg-muted/30 rounded-lg shadow-sm border border-border p-6">
                    <div className="mb-6">
                      <h2 className="text-section font-semibold text-foreground flex items-center">
                        <MapPin className="w-6 h-6 mr-2 text-primary" />
                        {displayedPaymentDetails.state}
                      </h2>
                    </div>

                    {/* Fees */}
                    <section className="bg-muted/50 border border-border rounded-lg p-6 mb-6">
                      <h3 className="text-section font-semibold text-foreground mb-4 flex items-center">
                        <Banknote className="w-5 h-5 mr-2 text-primary" />
                        Fees
                      </h3>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="bg-card rounded-lg p-4 border border-border">
                          <h4 className="text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">Male Entrepreneur</h4>
                          <p className="text-xl font-semibold text-foreground">{formatCurrency(displayedPaymentDetails.male_fee)}</p>
                        </div>
                        <div className="bg-card rounded-lg p-4 border border-border">
                          <h4 className="text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">Female Entrepreneur</h4>
                          <p className="text-xl font-semibold text-foreground">{formatCurrency(displayedPaymentDetails.female_fee)}</p>
                        </div>
                      </div>
                      <div className="mt-4 text-center">
                        <p className="text-sm font-medium text-foreground">Validity: {displayedPaymentDetails.validity_years} years</p>
                      </div>
                    </section>

                    {/* Method 1: QR Code */}
                    <section className="bg-muted/50 border border-border rounded-lg p-6 mb-6">
                      <h3 className="text-section font-semibold text-foreground mb-4 flex items-center">
                        <QrCode className="w-5 h-5 mr-2 text-primary" />
                        Method 1: Scan QR Code
                      </h3>
                      <div className="text-center">
                        <p className="text-muted-foreground mb-4">Scan QR Code directly using your mobile</p>
                        <div className="bg-card rounded-lg p-4 inline-block shadow-sm border border-border">
                          <img
                            src={displayedPaymentDetails.qr_code_image_url}
                            alt={`QR Code for ${displayedPaymentDetails.state} payment`}
                            className="w-48 h-48 object-cover rounded-lg max-w-full"
                          />
                        </div>
                      </div>
                    </section>

                    {/* Method 2: Bank Details */}
                    <section className="bg-muted/50 border border-border rounded-lg p-6">
                      <h3 className="text-section font-semibold text-foreground mb-4 flex items-center">
                        <Building2 className="w-5 h-5 mr-2 text-primary" />
                        Method 2: Bank Transfer / Cheque
                      </h3>
                      <div className="bg-card rounded-lg p-4 border border-border">
                        <p className="text-muted-foreground mb-4">Please make payments in favor of:</p>
                        <div className="space-y-2 text-foreground">
                          <p className="text-section font-semibold text-foreground">{displayedPaymentDetails.account_holder_name}</p>
                          <div className="grid md:grid-cols-2 gap-4 mt-4">
                            <div>
                              <span className="text-label font-medium text-muted-foreground uppercase tracking-wider">Account Number</span>
                              <p className="font-semibold text-foreground font-mono">{displayedPaymentDetails.account_number}</p>
                            </div>
                            <div>
                              <span className="text-label font-medium text-muted-foreground uppercase tracking-wider">IFSC Code</span>
                              <p className="font-semibold text-foreground font-mono">{displayedPaymentDetails.ifsc_code}</p>
                            </div>
                            <div>
                              <span className="text-label font-medium text-muted-foreground uppercase tracking-wider">Bank Name</span>
                              <p className="font-semibold text-foreground">{displayedPaymentDetails.bank_name}</p>
                            </div>
                            <div>
                              <span className="text-label font-medium text-muted-foreground uppercase tracking-wider">Branch</span>
                              <p className="font-semibold text-foreground">{displayedPaymentDetails.branch}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Important Notice */}
                    <section className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
                      <p className="text-destructive font-semibold text-center">
                        Please do not pay in the form of cash.
                      </p>
                    </section>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between pt-8 border-t border-border">
            <Link
              to="/"
              className="inline-flex items-center justify-center px-6 py-3 border border-border text-base font-medium rounded-lg text-foreground bg-card hover:bg-muted/50 transition-colors duration-200 sm:order-1"
            >
              <ArrowLeft className="mr-2 h-5 w-5" />
              Home
            </Link>
            <Link
              to={selectedStateName ? `/join?state=${encodeURIComponent(selectedStateName)}` : '/join'}
              className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-primary-foreground bg-primary hover:bg-primary/90 transition-colors duration-200 sm:order-2"
            >
              Registration Form
              <ArrowLeft className="ml-2 h-5 w-5 rotate-180" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payment;
