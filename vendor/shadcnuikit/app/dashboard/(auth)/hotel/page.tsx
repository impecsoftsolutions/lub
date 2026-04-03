import { generateMeta } from "@/lib/utils";
import { Metadata } from "next";
import { ReservationsCard } from "./components/reservations-card";
import { CampaignOverview } from "./components/campaign-overview";
import { RecentActivities } from "./components/recent-activities";
import { RevenueStat } from "./components/revenue-stat";
import { StatCards } from "./components/stat-cards";
import { BookingsCard } from "./components/bookings-card";
import { BookingList } from "./components/booking-list";
import { ClipboardMinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  return generateMeta({
    title: "Hotel Admin Dashboard",
    description:
      "On the hotel management admin dashboard, you can see your turnover, manage reservations, and view your customers. Built with shadcn/ui, Tailwind CSS, Next.js.",
    canonical: "/hotel"
  });
}

export default function Page() {
  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Hotel Management</h1>
        <div className="flex gap-2">
          <Button>
            <PlusIcon /> <span className="hidden md:flex">Add New</span>
          </Button>
          <Button variant="outline">
            <ClipboardMinusIcon /> <span className="hidden md:flex">Reports</span>
          </Button>
        </div>
      </div>
      <StatCards />
      <div className="gap-4 space-y-4 xl:grid xl:grid-cols-3 xl:space-y-0">
        <ReservationsCard />
        <div className="xl:col-span-2">
          <CampaignOverview />
        </div>
      </div>
      <div className="gap-4 space-y-4 xl:grid xl:grid-cols-3 xl:space-y-0">
        <RecentActivities />
        <RevenueStat />
        <BookingsCard />
      </div>
      <BookingList />
    </div>
  );
}
