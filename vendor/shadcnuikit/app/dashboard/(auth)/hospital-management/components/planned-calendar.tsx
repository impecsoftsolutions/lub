"use client";

import * as React from "react";

import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type AppointmentData = {
  avatar: string;
  hour: string;
  title: string;
  description: string;
  status: string;
  statusColor: "success" | "warning";
};

const data: AppointmentData[] = [
  {
    avatar: "/images/avatars/08.png",
    hour: "10:00-11:00 AM",
    title: "General Health Check up",
    description: "Dr. Dianne Philips",
    status: "active",
    statusColor: "success"
  },
  {
    avatar: "/images/avatars/04.png",
    hour: "05:00-06:00 PM",
    title: "Temporary Headache",
    description: "Dr. Jenny Smith",
    status: "pending",
    statusColor: "warning"
  }
];

export default function PlannedCalendar() {
  const [date, setDate] = React.useState<Date | undefined>(new Date());

  return (
    <Card className="p-0">
      <CardContent className="p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          today={new Date()}
          defaultMonth={new Date()}
          className="w-full!"
          monthsClassName="w-full"
          monthClassName="space-y-4 w-full flex flex-col"
          weekdayClassName="w-full!"
          weekClassName="w-full!"
          monthGridClassName="m-0"
          dayClassName="md:size-10"
          dayButtonClassName="md:size-12"
        />
      </CardContent>
      <div className="flex flex-col divide-y border-t px-0">
        {data.map((item, i) => (
          <div className="w-full" key={i}>
            <div className="flex items-center p-4">
              <Avatar>
                <AvatarImage src={item.avatar} />
                <AvatarFallback>AC</AvatarFallback>
              </Avatar>
              <div className="ms-4 space-y-1">
                <p className="leading-none font-medium">{item.title}</p>
                <p className="text-muted-foreground text-sm">
                  {item.description} at {item.hour}
                </p>
              </div>
              <Badge variant={item.statusColor} className="ms-auto capitalize">
                {item.status}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
