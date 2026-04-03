"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Note } from "@/app/dashboard/(auth)/apps/notes/types";
import { noteLabels } from "@/app/dashboard/(auth)/apps/notes/data";
import { Checkbox } from "@/components/ui/checkbox";

export default function NoteListItem({ note }: { note: Note }) {
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    if (note.type === "checklist" && note.items) {
      note.items.forEach((item, index) => {
        initial[index] = item.checked;
      });
    }
    return initial;
  });

  const handleCheckChange = (index: number, checked: boolean) => {
    setCheckedItems((prev) => ({
      ...prev,
      [index]: checked
    }));
  };

  return (
    <Card className="relative mb-4 block break-inside-avoid gap-0 overflow-hidden rounded-md transition-shadow group-data-[view-mode=list]:py-0 group-data-[view-mode=masonry]:pt-0 hover:shadow-lg md:group-data-[view-mode=list]:flex md:group-data-[view-mode=list]:flex-row">
      {note.type === "image" && note.image && (
        <figure className="top-0 h-full shrink-0 md:group-data-[view-mode=list]:w-62">
          <Image
            width={200}
            height={150}
            src={note.image}
            className="aspect-square h-full w-full object-cover group-data-[view-mode=list]:md:absolute md:group-data-[view-mode=list]:w-62"
            alt="shadcn/ui"
            unoptimized
          />
        </figure>
      )}
      <CardContent className="pt-6 group-data-[view-mode=list]:pb-6">
        <div className="space-y-4">
          <h3 className="font-display text-xl lg:text-2xl">{note.title}</h3>
          <p className="text-muted-foreground text-sm">{note.content}</p>
          {note.type === "checklist" && note.items && (
            <ul className="space-y-4">
              {note.items.map((item, key) => {
                const isChecked = checkedItems[key] ?? false;
                return (
                  <li key={key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`checklist_${note.id}_${key}`}
                      checked={isChecked}
                      onCheckedChange={(checked) => handleCheckChange(key, checked === true)}
                    />
                    <label
                      htmlFor={`checklist_${note.id}_${key}`}
                      className={cn(
                        "text-sm leading-none font-medium cursor-pointer",
                        isChecked && "text-muted-foreground line-through"
                      )}>
                      {item.text}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {note.type === "text" && note.content && (
            <p className="text-muted-foreground whitespace-pre-line">{note.content}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {note.labels.map((id, key) => {
              const label = noteLabels.find((e) => e.id === id);
              if (label)
                return (
                  <Badge key={key} variant="outline">
                    <span className={cn("me-1 size-2 shrink-0 rounded-full", label.color)}></span>
                    {label.title}
                  </Badge>
                );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
