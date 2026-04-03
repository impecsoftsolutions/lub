"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { HeartIcon, PlusIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Carousel, CarouselContent } from "@/components/ui/carousel";
import {
  Reel,
  ReelContent,
  ReelControls,
  ReelFooter,
  ReelImage,
  ReelItem,
  ReelMuteButton,
  ReelNavigation,
  ReelPlayButton,
  ReelProgress,
  ReelVideo
} from "@/components/ui/reel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { reels } from "../data";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export function SocialMediaStories() {
  const [showReel, setShowReel] = useState(false);
  const [activeReelId, setActiveReelId] = useState<string | number>();

  /*
  This code snippet moves the clicked reel item to the very top, so when
   the reel modal opens, the story I selected is shown first.
   */
  const orderedReels = activeReelId
    ? [
        reels.find((reel) => reel.id === activeReelId)!,
        ...reels.filter((reel) => reel.id !== activeReelId)
      ]
    : reels;

  function handleReelClick(id: string | number) {
    setActiveReelId(id);
    setShowReel(true);
  }

  return (
    <>
      <Carousel
        opts={{
          align: "start",
          dragFree: true
        }}
        className="w-full">
        <CarouselContent className="ml-0 py-1.5 select-none">
          <div className="group flex cursor-pointer flex-col items-center gap-2 px-2">
            <Avatar className="ring-muted group-hover:ring-primary/10 size-10 ring-2 lg:size-14">
              <AvatarFallback>
                <PlusIcon className="opacity-50" />
              </AvatarFallback>
            </Avatar>
            <span className="text-muted-foreground max-w-16 truncate text-xs">Create</span>
          </div>
          {reels.map((reel) => (
            <div key={reel.id} onClick={() => handleReelClick(reel.id)}>
              <div className="flex cursor-pointer flex-col items-center gap-2 px-1 hover:opacity-80 lg:px-2">
                <Avatar
                  className={cn("size-10 outline-2 outline-offset-3 lg:size-14", {
                    "outline-green-600": !reel.isRead,
                    "outline-black/20 dark:outline-white/20": reel.isRead
                  })}>
                  <AvatarImage src={reel.avatar} />
                  <AvatarFallback>{reel.username[0]}</AvatarFallback>
                </Avatar>
                <span className="text-muted-foreground max-w-16 truncate text-xs">
                  {reel.username}
                </span>
              </div>
            </div>
          ))}
        </CarouselContent>
      </Carousel>

      <Dialog open={showReel} onOpenChange={setShowReel}>
        <VisuallyHidden>
          <DialogHeader>
            <DialogTitle></DialogTitle>
          </DialogHeader>
        </VisuallyHidden>
        <DialogContent showCloseIcon={false} className="overflow-hidden border-0 p-0">
          <Reel data={orderedReels}>
            <ReelProgress />
            <ReelContent>
              {(reel) => (
                <ReelItem key={reel.id}>
                  {reel.type === "video" && <ReelVideo src={reel.src} />}
                  {reel.type === "image" && <ReelImage src={reel.src} alt={""} />}
                  <ReelFooter className="flex justify-between">
                    <div className="text-white">
                      <h5 className="text-lg font-semibold">{reel.title}</h5>
                      <p className="text-sm opacity-90">{reel.description}</p>
                    </div>
                    <Button variant="secondary" className="rounded-full bg-white/30" size="icon-lg">
                      <HeartIcon className="fill-white/80 text-white/80" />
                    </Button>
                  </ReelFooter>
                </ReelItem>
              )}
            </ReelContent>
            <ReelNavigation />
            <ReelControls className="end-0 top-0 bottom-auto left-auto bg-transparent">
              <div className="flex gap-2">
                <ReelPlayButton />
                <ReelMuteButton />
              </div>
            </ReelControls>
          </Reel>
        </DialogContent>
      </Dialog>
    </>
  );
}
