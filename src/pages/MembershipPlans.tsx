import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Loader2, X, Users, Factory, Globe, TrendingUp } from 'lucide-react';
import StateWiseFeePanel from '../components/StateWiseFeePanel';
import {
  membershipPlanService,
  MembershipPlanSetting,
  MembershipPlanFeature,
} from '../lib/supabase';

const MembershipPlans: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialState = searchParams.get('state') ?? undefined;

  const [plans, setPlans] = useState<MembershipPlanSetting[]>([]);
  const [features, setFeatures] = useState<MembershipPlanFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      membershipPlanService.getPublicPlanSettings(),
      membershipPlanService.getPublicPlanFeatures(),
    ])
      .then(([p, f]) => { setPlans(p); setFeatures(f); })
      .catch(() => { /* silently fall back to static defaults below */ })
      .finally(() => setIsLoading(false));
  }, []);

  const freePlan  = plans.find(p => p.planKey === 'free');
  const paidPlan  = plans.find(p => p.planKey === 'paid');

  const freeTitle    = freePlan?.title    ?? 'Free Membership';
  const freeSubtitle = freePlan?.subtitle ?? 'Start free — join the LUB digital community at no cost.';
  const paidTitle    = paidPlan?.title    ?? 'Paid LUB Membership';
  const paidSubtitle = paidPlan?.subtitle ?? 'Become a full LUB member — state-wise fees apply.';

  const freeIncludes = [
    'Create your free LUB portal account',
    'Follow LUB news, updates, and announcements',
    'Access public events and activities',
    'Upgrade to Paid Membership anytime',
  ];

  const paidIncludes = [
    'Member directory listing (as configured)',
    'LUB Business Showcase listing',
    'Member networking opportunities',
    'Member-only opportunities where applicable',
    'Eligibility for committee / leadership roles',
    'State-wise fee — Male and Female entrepreneur categories',
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-800 py-12 text-white sm:py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-200">
            Laghu Udyog Bharati
          </p>
          <h1 className="text-3xl font-bold sm:text-4xl">
            Join LUB — Choose Your Membership
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-blue-100">
            Empowering MSMEs across India through manufacturing excellence, Make in India, and local industry development.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 space-y-16">

        {/* Why LUB */}
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Factory, label: 'Manufacturing Focus', desc: 'Strong commitment to Make in India and domestic production.' },
            { icon: Users,   label: 'MSME Community',     desc: "Network with entrepreneurs across India's manufacturing and service sectors." },
            { icon: Globe,   label: 'National Reach',     desc: 'State-level chapters and national-level policy advocacy.' },
            { icon: TrendingUp, label: 'Business Growth', desc: 'Events, training, and connections that move your business forward.' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-5 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-foreground">{label}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </section>

        {/* Plan Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading plans…
          </div>
        ) : (
          <section>
            <h2 className="mb-8 text-center text-2xl font-bold text-foreground">Choose Your Plan</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Free Membership */}
              <div className="flex flex-col rounded-xl border border-border bg-card shadow-sm">
                <div className="rounded-t-xl bg-muted/40 px-6 py-5 border-b border-border">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                    Community Access
                  </p>
                  <h3 className="text-xl font-bold text-foreground">{freeTitle}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{freeSubtitle}</p>
                  <p className="mt-3 text-2xl font-bold text-foreground">Free</p>
                </div>
                <div className="flex flex-1 flex-col px-6 py-5">
                  <ul className="space-y-3 flex-1">
                    {freeIncludes.map(item => (
                      <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 text-xs text-muted-foreground border-t border-border pt-4">
                    Ready for full member benefits? Upgrade to Paid LUB Membership.
                  </p>
                  <Link
                    to="/signup"
                    className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Create Free Account
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              {/* Paid LUB Membership */}
              <div className="flex flex-col rounded-xl border-2 border-primary bg-card shadow-md">
                <div className="rounded-t-xl bg-primary/5 px-6 py-5 border-b border-primary/20">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
                    Full LUB Member
                  </p>
                  <h3 className="text-xl font-bold text-foreground">{paidTitle}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{paidSubtitle}</p>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    State-wise fees — see the fee selector below
                  </p>
                </div>
                <div className="flex flex-1 flex-col px-6 py-5">
                  <ul className="space-y-3 flex-1">
                    {paidIncludes.map(item => (
                      <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/join?membership=paid"
                    className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Apply for Paid Membership
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Feature Comparison Table */}
        {features.length > 0 && (
          <section>
            <h2 className="mb-6 text-center text-2xl font-bold text-foreground">What's Included</h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-5 py-3 text-left font-semibold text-foreground">Feature</th>
                    <th className="px-5 py-3 text-center font-semibold text-foreground w-28">Free</th>
                    <th className="px-5 py-3 text-center font-semibold text-primary w-28">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((f, i) => (
                    <tr
                      key={f.id}
                      className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}
                    >
                      <td className="px-5 py-3 text-foreground">{f.featureLabel}</td>
                      <td className="px-5 py-3 text-center">
                        {f.freeValue
                          ? <Check className="mx-auto h-4 w-4 text-green-600" />
                          : <X className="mx-auto h-4 w-4 text-red-600" />}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {f.paidValue
                          ? <Check className="mx-auto h-4 w-4 text-primary" />
                          : <X className="mx-auto h-4 w-4 text-red-600" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* State-wise Fee Selector */}
        <section>
          <h2 className="mb-2 text-center text-2xl font-bold text-foreground">State-wise Paid Membership Fees</h2>
          <p className="mb-8 text-center text-sm text-muted-foreground">
            Select your state to see the exact fee for male and female entrepreneurs.
          </p>
          <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6 shadow-sm">
            <StateWiseFeePanel
              initialState={initialState}
              ctaLabel="Apply for Paid Membership"
              ctaBasePath="/join?membership=paid"
              showNavigation={false}
            />
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-800 p-8 text-center text-white">
          <h2 className="mb-3 text-2xl font-bold">Ready to Join LUB?</h2>
          <p className="mx-auto mb-6 max-w-xl text-blue-100">
            Start with a free account today, or apply directly for Paid LUB Membership and unlock the full benefits of India's leading MSME organization.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/signup"
              className="rounded-lg border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              Start Free
            </Link>
            <Link
              to="/join?membership=paid"
              className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-50"
            >
              Apply for Paid Membership
              <ArrowRight className="ml-2 inline h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default MembershipPlans;
