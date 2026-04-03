"use client";

import React from "react";
import { cn } from "@/lib/utils";

import { useStore, Table } from "@/app/dashboard/(auth)/apps/pos-system/store";
import {
  EnumTableStatus,
  EnumTableStatusColor
} from "@/app/dashboard/(auth)/apps/pos-system/enums";

import { Badge } from "@/components/ui/badge";
import TableDetailDialog from "@/app/dashboard/(auth)/apps/pos-system/tables/components/table-detail-dialog";

type TableListItem = {
  table: Table;
};

export default function TableListItem({ table }: TableListItem) {
  const [openDialog, setOpenDialog] = React.useState(false);
  const { orders } = useStore();

  const tableOrder = orders.find((t) => t.tableId === table.id);

  if (tableOrder) {
    table.status = EnumTableStatus.OCCUPIED;
  }

  return (
    <>
      <div
        onClick={() => setOpenDialog(true)}
        key={table.id}
        className={cn(
          "cursor-pointer overflow-hidden rounded-lg border p-4 transition-all",
          EnumTableStatusColor[table.status as EnumTableStatus].card
        )}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-medium lg:text-lg">{table.name}</h3>
          <Badge
            variant={EnumTableStatusColor[table.status as EnumTableStatus].badge}
            className="capitalize">
            {table.status}
          </Badge>
        </div>

        {tableOrder && (
          <div className="mt-2 border-t pt-2">
            <p className="text-sm font-medium">Order #{tableOrder.id.split("-")[1]}</p>
            <p className="text-muted-foreground text-xs">{tableOrder.items.length} items</p>
          </div>
        )}
      </div>

      <TableDetailDialog
        table={table}
        order={tableOrder}
        open={openDialog}
        setOpen={setOpenDialog}
      />
    </>
  );
}
