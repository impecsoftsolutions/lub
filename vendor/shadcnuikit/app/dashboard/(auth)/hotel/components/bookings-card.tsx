"use client";

import { useState } from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Info } from "lucide-react";

const data = {
  daily: {
    totalBookings: 678.5,
    onlineBooking: 200,
    offlineBooking: 478
  },
  weekly: {
    totalBookings: 4752.0,
    onlineBooking: 2500,
    offlineBooking: 2252
  },
  monthly: {
    totalBookings: 20395.5,
    onlineBooking: 14839,
    offlineBooking: 5556
  },
  yearly: {
    totalBookings: 244746.0,
    onlineBooking: 195000,
    offlineBooking: 49746
  }
};

export function BookingsCard() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");

  const periods = [
    { value: "daily", label: "D" },
    { value: "weekly", label: "W" },
    { value: "monthly", label: "M" },
    { value: "yearly", label: "Y" }
  ] as const;

  const currentData = data[period];
  const total = currentData.onlineBooking + currentData.offlineBooking;
  const onlinePercentage = (currentData.onlineBooking / total) * 100;
  const offlinePercentage = (currentData.offlineBooking / total) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bookings</CardTitle>
        <CardAction>
          <Tabs value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
            <TabsList>
              {periods.map((p) => (
                <TabsTrigger key={p.value} value={p.value}>
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold lg:text-3xl">
            {currentData.totalBookings.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </span>
          <span className="text-muted-foreground text-sm">Total Bookings</span>
        </div>

        <Separator />

        <div className="flex h-12 w-full overflow-hidden rounded-lg">
          <div
            className="bg-green-500 transition-all duration-500 ease-out dark:bg-green-700"
            style={{ width: `${onlinePercentage}%` }}
          />
          <div
            className="bg-destructive transition-all duration-500 ease-out"
            style={{ width: `${offlinePercentage}%` }}
          />
        </div>

        <div className="flex justify-between">
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">Online Booking</p>
            <p className="font-semibold lg:text-xl">{currentData.onlineBooking.toLocaleString()}</p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-muted-foreground text-sm">Offline Booking</p>
            <p className="font-semibold lg:text-xl">
              {currentData.offlineBooking.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border p-3">
          <Info className="text-muted-foreground h-4 w-4" />
          <span className="text-muted-foreground text-sm">
            Unlock in-depth analysis with a premium subscription
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
