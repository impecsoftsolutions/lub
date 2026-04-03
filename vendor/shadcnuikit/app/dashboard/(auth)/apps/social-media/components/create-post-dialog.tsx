"use client";

import { useState } from "react";
import { Plus, Video, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";

export function CreatePostDialog() {
  const [newPostType, setNewPostType] = useState<"text" | "image" | "video">("text");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="mt-4 w-full">
          <Plus />
          Create Post
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* User Header */}
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src="https://i.pravatar.cc/150?img=13" />
              <AvatarFallback>XA</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">Toby Belhome</p>
              <p className="text-muted-foreground text-xs">Public</p>
            </div>
          </div>

          {/* Post Type Selection */}
          <div className="flex gap-2">
            <Button
              variant={newPostType === "text" ? "default" : "outline"}
              size="sm"
              onClick={() => setNewPostType("text")}>
              Text
            </Button>
            <Button
              variant={newPostType === "image" ? "default" : "outline"}
              size="sm"
              onClick={() => setNewPostType("image")}>
              <ImageIcon />
              Photo
            </Button>
            <Button
              variant={newPostType === "video" ? "default" : "outline"}
              size="sm"
              onClick={() => setNewPostType("video")}>
              <Video />
              Video
            </Button>
          </div>

          {/* Text Area */}
          <Textarea placeholder="What's on your mind?" className="min-h-32 resize-none" />

          {/* Media Preview */}
          {newPostType === "image" && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <ImageIcon className="text-muted-foreground/50 mx-auto size-8" />
              <p className="text-muted-foreground mt-2 text-sm">Add photos to your post</p>
              <Button variant="outline" size="sm" className="mt-2">
                Upload Photo
              </Button>
            </div>
          )}

          {newPostType === "video" && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Video className="text-muted-foreground/50 mx-auto size-8" />
              <p className="text-muted-foreground mt-2 text-sm">Add video to your post</p>
              <Button variant="outline" size="sm" className="mt-2">
                Upload Video
              </Button>
            </div>
          )}

          {/* Action Icons */}
          <div className="flex items-center justify-end">
            <Button>Post</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
