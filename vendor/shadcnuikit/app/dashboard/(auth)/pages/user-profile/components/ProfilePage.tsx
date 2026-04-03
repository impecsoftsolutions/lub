import { UserPlus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileSidebar } from "./ProfileSidebar";
import { ActivityStream } from "./ActivityStream";
import { ConnectionsTeams } from "./ConnectionsTeams";
import { ProjectsTable } from "./ProjectsTable";

export function ProfilePage() {
  return (
    <div className="mx-auto min-h-screen lg:max-w-7xl xl:pt-6">
      <div className="space-y-4">
        <div className="bg-card overflow-hidden rounded-md border">
          <ProfileHeader />

          <div className="border-t">
            <div className="flex items-center justify-between px-4">
              <Tabs defaultValue="profile" className="flex-1">
                <TabsList className="-mb-0.5 h-auto gap-6 border-none bg-transparent p-0">
                  <TabsTrigger
                    value="profile"
                    className="data-[state=active]:border-b-primary data-[state=active]:text-foreground text-muted-foreground rounded-none border-b-2 border-transparent px-0 py-4 shadow-none!">
                    Profile
                  </TabsTrigger>
                  <TabsTrigger
                    value="teams"
                    className="data-[state=active]:border-b-primary data-[state=active]:text-foreground text-muted-foreground rounded-none border-b-2 border-transparent px-0 py-4 shadow-none!">
                    Teams
                  </TabsTrigger>
                  <TabsTrigger
                    value="projects"
                    className="data-[state=active]:border-b-primary data-[state=active]:text-foreground text-muted-foreground rounded-none border-b-2 border-transparent px-0 py-4 shadow-none!">
                    Projects
                    <Badge variant="secondary" className="rounded-full">
                      3
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-2">
                <Button size="sm">
                  <UserPlus />
                  <span className="hidden md:inline">Connect</span>
                </Button>
                <Button variant="outline" size="icon-sm">
                  <MoreHorizontal />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="gap-4 space-y-4 lg:grid lg:grid-cols-[320px_1fr] lg:space-y-0 xl:grid-cols-[360px_1fr]">
          <ProfileSidebar />

          <main className="space-y-6">
            <ActivityStream />
            <ConnectionsTeams />
            <ProjectsTable />
          </main>
        </div>
      </div>
    </div>
  );
}
