"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Layout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  const tabs = [
    {
      label: "Fitness",
      key: "fitness",
      href: "/dashboard/widgets/fitness"
    },
    {
      label: "E-commerce",
      key: "ecommerce",
      href: "/dashboard/widgets/ecommerce"
    },
    {
      label: "Analytics",
      key: "analytics",
      href: "/dashboard/widgets/analytics"
    }
  ];

  return (
    <>
      <div className="mb-4 flex gap-2 [&_[data-slot=button]]:rounded-full">
        {tabs.map((tab) => (
          <Button
            variant={pathname.endsWith(tab.key) ? "default" : "outline"}
            key={tab.key}
            asChild>
            <Link href={tab.href}>{tab.label}</Link>
          </Button>
        ))}
      </div>
      {children}
    </>
  );
}
