import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Wand2, Palette, Image, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ImageGeneratorFormProps {
  onGenerate: (params: GenerationParams) => void;
  isGenerating: boolean;
}

export interface GenerationParams {
  prompt: string;
  negativePrompt: string;
  style: string;
  aspectRatio: string;
  quality: string;
  count: number;
  seed: string;
}

const styles = [
  "Realistic",
  "Digital Art",
  "Fantasy",
  "Anime",
  "Photographic",
  "Illustration",
  "Abstract",
  "Vintage"
];

const aspectRatios = [
  { value: "1:1", label: "Square (1:1)" },
  { value: "16:9", label: "Landscape (16:9)" },
  { value: "9:16", label: "Portrait (9:16)" },
  { value: "4:3", label: "Classic (4:3)" },
  { value: "3:2", label: "Photo (3:2)" }
];

const qualities = ["Standard", "High", "Ultra"];

const quickPrompts = [
  { label: "Futuristic City", icon: Sparkles },
  { label: "Fantasy Dragon", icon: Palette },
  { label: "Abstract Art", icon: Image },
  { label: "Nature Scene", icon: Wand2 }
];

function CardFormContent({ onGenerate, isGenerating }: ImageGeneratorFormProps) {
  const [formData, setFormData] = useState<GenerationParams>({
    prompt: "",
    negativePrompt: "",
    style: "Realistic",
    aspectRatio: "1:1",
    quality: "Standard",
    count: 2,
    seed: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    onGenerate(formData);
  };

  const handleQuickPrompt = (prompt: string) => {
    setFormData((prev) => ({ ...prev, prompt }));
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Prompt */}
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt</Label>
          <Textarea
            id="prompt"
            placeholder="Describe the image you want to generate..."
            value={formData.prompt}
            onChange={(e) => setFormData((prev) => ({ ...prev, prompt: e.target.value }))}
            className="min-h-[100px]"
          />
          <p className="text-muted-foreground text-xs">
            Be specific and descriptive for better results
          </p>
        </div>

        {/* Negative Prompt */}
        <div className="space-y-2">
          <Label htmlFor="negative-prompt">Negative Prompt (Optional)</Label>
          <Textarea
            id="negative-prompt"
            placeholder="What you don't want in the image..."
            value={formData.negativePrompt}
            onChange={(e) => setFormData((prev) => ({ ...prev, negativePrompt: e.target.value }))}
            className="min-h-[80px] resize-none"
          />
        </div>

        {/* Style and Aspect Ratio */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Style</Label>
            <Select
              value={formData.style}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, style: value }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {styles.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Aspect Ratio</Label>
            <Select
              value={formData.aspectRatio}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, aspectRatio: value }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aspectRatios.map((ratio) => (
                  <SelectItem key={ratio.value} value={ratio.value}>
                    {ratio.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Quality and Count */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Quality</Label>
            <Select
              value={formData.quality}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, quality: value }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {qualities.map((quality) => (
                  <SelectItem key={quality} value={quality}>
                    {quality}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Count</Label>
            <Select
              value={formData.count.toString()}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, count: parseInt(value) }))
              }>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((count) => (
                  <SelectItem key={count} value={count.toString()}>
                    {count} Image{count > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Seed */}
        <div className="space-y-2">
          <Label htmlFor="seed">Seed (Optional)</Label>
          <Input
            id="seed"
            placeholder="Random seed for reproducibility"
            value={formData.seed}
            onChange={(e) => setFormData((prev) => ({ ...prev, seed: e.target.value }))}
          />
        </div>

        {/* Generate Button */}
        <Button type="submit" size="lg" className="w-full" disabled={isGenerating}>
          {isGenerating ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Generating...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              Generate Image
            </>
          )}
        </Button>
      </form>

      {/* Quick Prompts */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Quick Prompts</Label>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((quick) => {
            const Icon = quick.icon;
            return (
              <Button
                key={quick.label}
                variant="outline"
                size="sm"
                onClick={() => handleQuickPrompt(quick.label)}
                className="justify-start">
                <Icon className="h-3 w-3" />
                {quick.label}
              </Button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export const ImageGeneratorForm: React.FC<ImageGeneratorFormProps> = ({
  onGenerate,
  isGenerating
}) => {
  return (
    <>
      {/* Desktop */}
      <ScrollArea className="hidden h-full min-h-0 lg:block">
        <Card>
          <CardContent className="space-y-6">
            <CardFormContent onGenerate={onGenerate} isGenerating={isGenerating} />
          </CardContent>
        </Card>
      </ScrollArea>

      {/* Mobile */}
      <div className="block space-y-4 overflow-y-auto px-4 pb-4 lg:hidden">
        <CardFormContent onGenerate={onGenerate} isGenerating={isGenerating} />
      </div>
    </>
  );
};
