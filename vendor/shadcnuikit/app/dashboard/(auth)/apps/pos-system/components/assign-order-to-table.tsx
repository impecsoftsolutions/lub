"use client";

import React from "react";
import { cn } from "@/lib/utils";

import { Table, TableCategory, useStore } from "@/app/dashboard/(auth)/apps/pos-system/store";
import {
  EnumTableStatus,
  EnumTableStatusColor
} from "@/app/dashboard/(auth)/apps/pos-system/enums";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

type AssignOrderToTable = {
  open: boolean;
  setOpen: (e: boolean) => void;
  tableCategories: TableCategory[];
  tables: Table[];
};

export default function AssignOrderToTable({
  open,
  setOpen,
  tableCategories,
  tables
}: AssignOrderToTable) {
  const { orders, assignOrderToTable } = useStore();

  const [selectedCategory, setSelectedCategory] = React.useState(tables[0]?.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Order to Table</DialogTitle>
          <DialogDescription>Please select a table to assign this order</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Tabs defaultValue={selectedCategory} className="w-full">
            <TabsList className="h-auto w-full flex-col lg:h-9 lg:flex-row">
              {tableCategories.map((category) => (
                <TabsTrigger className="w-full lg:w-auto" key={category.id} value={category.id}>
                  {category.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {tableCategories.map((c) => (
              <TabsContent key={c.id} value={c.id}>
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {tables
                    .filter((table) => table.category === c.id)
                    .map((table) => {
                      const tableOrder = orders.find((t) => t.tableId === table.id);

                      if (tableOrder) {
                        table.status = "occupied";
                      }

                      return (
                        <Button
                          key={table.id}
                          variant="outline"
                          className="flex h-16 flex-col"
                          disabled={table.status === "occupied"}
                          onClick={() => {
                            assignOrderToTable(table.id);
                            setOpen(false);
                          }}>
                          <span>{table.name}</span>
                          <span
                            className={cn(
                              "text-xs capitalize",
                              EnumTableStatusColor[table.status as EnumTableStatus].text
                            )}>
                            {table.status}
                          </span>
                        </Button>
                      );
                    })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
