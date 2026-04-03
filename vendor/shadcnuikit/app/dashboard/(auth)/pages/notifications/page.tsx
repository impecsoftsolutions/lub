import Link from "next/link";
import { Check, Settings } from "lucide-react";
import { generateMeta } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import NotificationsDataTable, { Notification } from "./data-table";

import notifications from "./data.json";

export async function generateMetadata() {
  return generateMeta({
    title: "Notifications Page built with Shadcn UI and Tailwind CSS",
    description:
      "Notifications page is a ui template used to display notifications to the user. Built with shadcn/ui, Tailwind CSS, Next.js and React.",
    canonical: "/pages/notifications"
  });
}

export default async function Page() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 xl:mt-8">
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Notifications</h1>
        <div className="flex items-center gap-2">
          <Button>
            <Check />
            Mark All as Read
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/pages/settings/notifications">
              <Settings />
            </Link>
          </Button>
        </div>
      </div>
      <NotificationsDataTable data={notifications as Notification[]} />
    </div>
  );
}
