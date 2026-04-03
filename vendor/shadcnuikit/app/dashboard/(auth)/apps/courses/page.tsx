import { generateMeta } from "@/lib/utils";
import { Metadata } from "next";
import courseData from "./data.json";
import { List, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { InstructorSection, CourseContent, StudyProgress, CourseModules } from "./components";

export async function generateMetadata(): Promise<Metadata> {
  return generateMeta({
    title: "Course App built with Shadcn UI and Tailwind CSS",
    description:
      "Courses app is a ui template used to browse, register for, and manage training courses. Built with shadcn/ui, Tailwind CSS, Next.js and React.",
    canonical: "/apps/courses"
  });
}

export default function Page() {
  const { data: course } = courseData;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">{course.title}</h1>
        <div className="flex gap-2 lg:hidden">
          <Drawer direction="bottom">
            <DrawerTrigger asChild>
              <Button variant="outline" size="sm">
                <BarChart3 />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <StudyProgress progress={course.progress} />
            </DrawerContent>
          </Drawer>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <List />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <CourseModules
                data={{
                  modules: course.modules,
                  completedCount: course.completedModules,
                  totalCount: course.totalModules
                }}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="relative aspect-video overflow-hidden rounded-xl">
            <video
              controls
              poster={course.video.thumbnail}
              className="h-full w-full object-cover"
              preload="metadata">
              <source src={course.video.src} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>

          <InstructorSection instructor={course.instructor} />

          <CourseContent
            data={{
              about: course.about,
              suitFor: course.suitFor
            }}
          />
        </div>

        <div className="hidden space-y-4 lg:col-span-1 lg:block">
          <StudyProgress progress={course.progress} />

          <CourseModules
            data={{
              modules: course.modules,
              completedCount: course.completedModules,
              totalCount: course.totalModules
            }}
          />
        </div>
      </div>
    </div>
  );
}
