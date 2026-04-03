"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Table, TableCategory } from "@/app/dashboard/(auth)/apps/pos-system/store";

import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import TableListItem from "@/app/dashboard/(auth)/apps/pos-system/tables/components/table-list-item";
import AddTableDialog from "@/app/dashboard/(auth)/apps/pos-system/tables/components/add-table-dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

type PosSystemTableRender = {
  tableCategories: TableCategory[];
  tables: Table[];
};

export default function PosSystemTableRender({ tableCategories, tables }: PosSystemTableRender) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredTables = React.useCallback(() => {
    if (!selectedCategory) {
      return tables;
    }
    return tables.filter((c) => c.category === selectedCategory);
  }, [selectedCategory]);

  return (
    <div className="flex flex-col md:flex-row">
      <div className="flex flex-1 flex-col gap-4 overflow-hidden md:flex-row">
        <div className="flex-1 space-y-4 overflow-auto pb-20 md:pb-0">
          <div className="sticky top-0 z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Button variant="outline" asChild>
                        <Link href="/dashboard/apps/pos-system">
                          <ChevronLeft />
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">Menu</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Tables</h1>
              </div>
              <div className="flex gap-2">
                <AddTableDialog tableCategories={tableCategories} />
              </div>
            </div>
          </div>

          {/* Categories */}
          <ScrollArea className="w-full whitespace-nowrap">
            <RadioGroup
              className="flex gap-4"
              defaultValue="all"
              onValueChange={(value) => setSelectedCategory(value === "all" ? null : value)}>
              <div className="has-data-[state=checked]:border-primary has-focus-visible:border-ring has-focus-visible:ring-ring/50 relative flex cursor-pointer flex-col items-center gap-4 rounded-md border px-4 py-4 text-center outline-none">
                <RadioGroupItem id={`c-all`} value="all" className="sr-only" />
                <label
                  htmlFor={`c-all`}
                  className="text-foreground cursor-pointer leading-none after:absolute after:inset-0">
                  All
                </label>
              </div>
              {tableCategories.map((category) => (
                <div
                  key={category.id}
                  className="has-data-[state=checked]:border-primary has-focus-visible:border-ring has-focus-visible:ring-ring/50 relative flex cursor-pointer flex-col items-center gap-4 rounded-md border px-4 py-4 text-center outline-none">
                  <RadioGroupItem id={`c-${category.id}`} value={category.id} className="sr-only" />
                  <label
                    htmlFor={`c-${category.id}`}
                    className="text-foreground cursor-pointer leading-none after:absolute after:inset-0">
                    {category.name}
                  </label>
                </div>
              ))}
            </RadioGroup>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          {/* Categories */}

          {filteredTables().length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              {filteredTables().map((table) => (
                <TableListItem key={table.id} table={table} />
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground py-4 text-center">There are no tables here.</div>
          )}
        </div>
      </div>
    </div>
  );
}
