import React from "react";
import Image from "next/image";

import { Order, Table } from "@/app/dashboard/(auth)/apps/pos-system/store";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type TableDetailDialog = {
  open: boolean;
  setOpen: (e: boolean) => void;
  table: Table;
  order?: Order;
};

export default function TableDetailDialog({ table, order, open, setOpen }: TableDetailDialog) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {table?.name} {order && <>- Order #{order?.id.split("-")[1]}</>}
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          {order ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="success">{order.items.length} items</Badge>
                <div className="text-muted-foreground text-sm">
                  Created: {order.createdAt.toLocaleString()}
                </div>
              </div>

              <div className="overflow-hidden rounded-md border">
                <table className="w-full">
                  <thead className="">
                    <tr>
                      <th className="text-muted-foreground px-4 py-2 text-left text-xs font-medium tracking-wider uppercase">
                        Item
                      </th>
                      <th className="text-muted-foreground px-4 py-2 text-center text-xs font-medium tracking-wider uppercase">
                        Qty
                      </th>
                      <th className="text-muted-foreground px-4 py-2 text-right text-xs font-medium tracking-wider uppercase">
                        Price
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {order.items.map((item) => (
                      <tr key={item.product.id}>
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            <div className="relative mr-3 h-10 w-10 overflow-hidden rounded">
                              <Image
                                src={item.product.image || "/placeholder.svg"}
                                alt={item.product.name}
                                fill
                                className="object-cover"
                              />
                            </div>
                            <div>
                              <p>{item.product.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">{item.quantity}</td>
                        <td className="px-4 py-3 text-right">
                          ${(item.product.price * item.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="">
                    <tr>
                      <td colSpan={2} className="px-4 py-2 text-right">
                        Subtotal:
                      </td>
                      <td className="px-4 py-2 text-right">${(order.total / 1.05).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="px-4 py-2 text-right">
                        Tax (5%):
                      </td>
                      <td className="px-4 py-2 text-right">
                        ${(order.total - order.total / 1.05).toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="px-4 py-2 text-right font-bold">
                        Total:
                      </td>
                      <td className="px-4 py-2 text-right font-bold">${order.total.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center">There is no order at this table..</div>
          )}
        </div>
        <DialogFooter className="flex-row">
          {table?.status === "occupied" && (
            <Button
              variant="destructive"
              className="mr-auto"
              onClick={() => {
                // clearTable(selectedTable.id);
                setOpen(false);
              }}>
              Clear Table
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
