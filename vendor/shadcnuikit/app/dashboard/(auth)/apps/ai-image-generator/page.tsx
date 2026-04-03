import { Metadata } from "next";
import { generateMeta } from "@/lib/utils";

import ImageGenerator from "./components/image-generator";
import { TooltipProvider } from "@/components/ui/tooltip";

export async function generateMetadata(): Promise<Metadata> {
  return generateMeta({
    title: "AI Image Generator",
    description:
      "UI components and application template for AI image generation tools. Built with Tailwind CSS, React, Next.js. shadcn/ui is compatible and contains Typescript files.",
    canonical: "/apps/ai-image-generator"
  });
}

export default function Page() {
  return <ImageGenerator />;
}
