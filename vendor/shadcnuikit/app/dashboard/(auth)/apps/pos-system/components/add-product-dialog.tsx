import React from "react";
import { AlertCircleIcon, ImageIcon, Plus, UploadIcon, XIcon } from "lucide-react";

import { ProductCategory } from "@/app/dashboard/(auth)/apps/pos-system/store";
import { useFileUpload } from "@/hooks/use-file-upload";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type AddProductDialog = {
  categories: ProductCategory[];
};

export default function AddProductDialog({ categories }: AddProductDialog) {
  const [open, setOpen] = React.useState(false);

  const maxSizeMB = 2;
  const maxSize = maxSizeMB * 1024 * 1024;

  const [
    { files, isDragging, errors },
    {
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      openFileDialog,
      removeFile,
      getInputProps
    }
  ] = useFileUpload({
    accept: "image/png,image/jpeg,image/jpg",
    maxSize
  });
  const previewUrl = files[0]?.preview || null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus />
          <span className="hidden sm:inline">Add Product</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="product-name">Product Name</Label>
            <Input id="product-name" placeholder="Americano, Pepperoni Pizza etc." />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-price">Price</Label>
              <Input id="product-price" type="number" placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-category">Category</Label>
              <Select>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category: ProductCategory) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.icon} {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Image</Label>
            <div className="flex flex-col gap-2">
              <div className="relative">
                <div
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  data-dragging={isDragging || undefined}
                  className="border-input data-[dragging=true]:bg-accent/50 has-[input:focus]:border-ring has-[input:focus]:ring-ring/50 relative flex min-h-52 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed p-4 transition-colors has-[input:focus]:ring-[3px]">
                  <input {...getInputProps()} className="sr-only" aria-label="Upload image file" />
                  {previewUrl ? (
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                      <img
                        src={previewUrl}
                        className="mx-auto max-h-full rounded object-contain"
                        alt={files[0]?.file?.name || "Uploaded image"}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
                      <div
                        className="bg-background mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border"
                        aria-hidden="true">
                        <ImageIcon className="size-4 opacity-60" />
                      </div>
                      <p className="mb-1.5 text-sm font-medium">Drop your image here</p>
                      <p className="text-muted-foreground text-xs">
                        PNG or JPG (max. {maxSizeMB}MB)
                      </p>
                      <Button variant="outline" className="mt-4" onClick={openFileDialog}>
                        <UploadIcon className="-ms-1 size-4 opacity-60" aria-hidden="true" />
                        Select image
                      </Button>
                    </div>
                  )}
                </div>

                {previewUrl && (
                  <div className="absolute top-4 right-4">
                    <button
                      type="button"
                      className="focus-visible:border-ring focus-visible:ring-ring/50 z-50 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white transition-[color,box-shadow] outline-none hover:bg-black/80 focus-visible:ring-[3px]"
                      onClick={() => removeFile(files[0]?.id)}
                      aria-label="Remove image">
                      <XIcon className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              {errors.length > 0 && (
                <div className="text-destructive flex items-center gap-1 text-xs" role="alert">
                  <AlertCircleIcon className="size-3 shrink-0" />
                  <span>{errors[0]}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
