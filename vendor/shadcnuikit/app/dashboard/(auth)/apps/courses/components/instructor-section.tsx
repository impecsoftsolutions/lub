import { Share2, Bookmark } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Instructor {
  name: string;
  role: string;
  avatar: string;
}

interface InstructorSectionProps {
  instructor: Instructor;
}

export function InstructorSection({ instructor }: InstructorSectionProps) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-4">
          <Avatar className="size-12">
            <AvatarImage src={instructor.avatar} alt={instructor.name} />
            <AvatarFallback>{instructor.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="font-semibold">{instructor.name}</h3>
            <p className="text-muted-foreground text-sm">{instructor.role}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm">
              <Share2 />
            </Button>
            <Button variant="ghost" size="sm">
              <Bookmark />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
