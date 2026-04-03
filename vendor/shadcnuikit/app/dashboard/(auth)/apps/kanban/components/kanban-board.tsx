"use client";

import * as React from "react";
import {
  GripVertical,
  Paperclip,
  MessageSquare,
  PlusCircleIcon,
  Search,
  CheckIcon,
  SlidersHorizontalIcon,
  SearchIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import * as Kanban from "@/components/ui/kanban";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import AddAssigne from "./add-assigne";

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high";
  assignee?: string;
  dueDate?: string;
  progress: number;
  attachments?: number;
  comments?: number;
  users: TaskUser[];
}

interface TaskUser {
  name: string;
  src: string;
  alt?: string;
  fallback?: string;
}

export default function KanbanBoard() {
  const [columns, setColumns] = React.useState<Record<string, Task[]>>({
    backlog: [
      {
        id: "1",
        title: "Integrate Stripe payment gateway",
        description: "Set up and configure Stripe API for handling credit card transactions.",
        priority: "high",
        assignee: "Emma Johnson",
        dueDate: "2024-09-20",
        users: [
          {
            name: "Emma",
            src: "/images/avatars/01.png",
            alt: "Emma Avatar",
            fallback: "EJ"
          },
          {
            name: "Daniel",
            src: "/images/avatars/02.png",
            alt: "Daniel Avatar",
            fallback: "DS"
          }
        ],
        progress: 10,
        attachments: 2,
        comments: 4
      },
      {
        id: "2",
        title: "Redesign marketing homepage",
        description: "Update the homepage with the new brand colors, typography, and hero section.",
        priority: "medium",
        assignee: "Lucas Brown",
        dueDate: "2024-09-25",
        users: [
          {
            name: "Lucas",
            src: "/images/avatars/03.png",
            alt: "Lucas Avatar",
            fallback: "LB"
          },
          {
            name: "Sophia",
            src: "/images/avatars/04.png",
            alt: "Sophia Avatar",
            fallback: "SR"
          }
        ],
        progress: 0,
        attachments: 1,
        comments: 1
      },
      {
        id: "3",
        title: "Set up automated backups",
        description: "Implement daily database backups with secure cloud storage.",
        priority: "low",
        assignee: "Mia Williams",
        dueDate: "2024-09-28",
        users: [
          {
            name: "Mia",
            src: "/images/avatars/05.png",
            alt: "Mia Avatar",
            fallback: "MW"
          },
          {
            name: "Jack",
            src: "/images/avatars/06.png",
            alt: "Jack Avatar",
            fallback: "JL"
          }
        ],
        progress: 5,
        attachments: 0,
        comments: 3
      },
      {
        id: "4",
        title: "Implement blog search functionality",
        description: "Add a search bar to filter blog posts by title and tags.",
        priority: "medium",
        assignee: "Olivia Davis",
        dueDate: "2024-09-29",
        users: [
          {
            name: "Olivia",
            src: "/images/avatars/07.png",
            alt: "Olivia Avatar",
            fallback: "OD"
          },
          {
            name: "Henry",
            src: "/images/avatars/08.png",
            alt: "Henry Avatar",
            fallback: "HT"
          }
        ],
        progress: 0,
        attachments: 1,
        comments: 0
      }
    ],
    inProgress: [
      {
        id: "5",
        title: "Dark mode toggle implementation",
        description: "Allow users to switch between light and dark themes in settings.",
        priority: "high",
        assignee: "Charlie Wilson",
        dueDate: "2024-09-18",
        users: [
          {
            name: "Charlie",
            src: "/images/avatars/09.png",
            alt: "Charlie Avatar",
            fallback: "CW"
          },
          {
            name: "Ava",
            src: "/images/avatars/10.png",
            alt: "Ava Avatar",
            fallback: "AR"
          }
        ],
        progress: 40,
        attachments: 2,
        comments: 6
      },
      {
        id: "6",
        title: "Database schema refactoring",
        description: "Normalize tables and improve query performance for large datasets.",
        priority: "medium",
        assignee: "Liam Martinez",
        dueDate: "2024-09-19",
        users: [
          {
            name: "Liam",
            src: "/images/avatars/11.png",
            alt: "Liam Avatar",
            fallback: "LM"
          },
          {
            name: "Isabella",
            src: "/images/avatars/12.png",
            alt: "Isabella Avatar",
            fallback: "IN"
          }
        ],
        progress: 55,
        attachments: 3,
        comments: 2
      },
      {
        id: "7",
        title: "Accessibility improvements",
        description: "Ensure the platform meets WCAG 2.1 AA accessibility standards.",
        priority: "low",
        assignee: "Noah Taylor",
        dueDate: "2024-09-22",
        users: [
          {
            name: "Noah",
            src: "/images/avatars/13.png",
            alt: "Noah Avatar",
            fallback: "NT"
          },
          {
            name: "Ella",
            src: "/images/avatars/14.png",
            alt: "Ella Avatar",
            fallback: "EL"
          }
        ],
        progress: 35,
        attachments: 1,
        comments: 1
      }
    ],
    done: [
      {
        id: "8",
        title: "Set up CI/CD pipeline",
        description: "Automate deployment process using GitHub Actions and Vercel.",
        priority: "high",
        assignee: "Ethan Clark",
        dueDate: "2024-09-12",
        users: [
          {
            name: "Ethan",
            src: "/images/avatars/15.png",
            alt: "Ethan Avatar",
            fallback: "EC"
          },
          {
            name: "Grace",
            src: "/images/avatars/16.png",
            alt: "Grace Avatar",
            fallback: "GR"
          }
        ],
        progress: 100,
        attachments: 2,
        comments: 4
      },
      {
        id: "9",
        title: "Initial project setup",
        description:
          "Create project structure, install dependencies, and configure ESLint/Prettier.",
        priority: "medium",
        assignee: "Harper Lewis",
        dueDate: "2024-09-10",
        users: [
          {
            name: "Harper",
            src: "/images/avatars/17.png",
            alt: "Harper Avatar",
            fallback: "HL"
          },
          {
            name: "Benjamin",
            src: "/images/avatars/18.png",
            alt: "Benjamin Avatar",
            fallback: "BM"
          }
        ],
        progress: 100,
        attachments: 1,
        comments: 2
      }
    ]
  });

  const [columnTitles, setColumnTitles] = React.useState<Record<string, string>>({
    backlog: "Backlog",
    inProgress: "In Progress",
    done: "Done"
  });

  const [filteredColumns, setFilteredColumns] = React.useState(columns);

  const [filterStatus, setFilterStatus] = React.useState<string | null>(null);
  const [filterPriority, setFilterPriority] = React.useState<string | null>(null);
  const [filterUser, setFilterUser] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const [isNewColumnModalOpen, setIsNewColumnModalOpen] = React.useState(false);
  const [newColumnTitle, setNewColumnTitle] = React.useState("");

  const getActiveFilters = () => {
    const filters = [];
    if (filterStatus) filters.push(filterStatus);
    if (filterPriority) filters.push(filterPriority);
    if (filterUser) filters.push(filterUser);
    return filters;
  };

  const [searchQuery, setSearchQuery] = React.useState("");

  const filterTasks = React.useCallback(() => {
    let filtered: Record<string, Task[]> = { ...columns };

    Object.keys(filtered).forEach((columnKey) => {
      filtered[columnKey] = columns[columnKey].filter((task) => {
        const searchMatch =
          searchQuery === "" ||
          task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (task.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
          task.assignee?.toLowerCase().includes(searchQuery.toLowerCase());

        const statusMatch =
          !filterStatus ||
          (filterStatus === "completed"
            ? task.progress === 100
            : filterStatus === "inProgress"
              ? task.progress > 0 && task.progress < 100
              : filterStatus === "notStarted"
                ? task.progress === 0
                : true);

        const priorityMatch = !filterPriority || task.priority === filterPriority;

        const userMatch = !filterUser || task.users.some((user) => user.name === filterUser);

        return searchMatch && statusMatch && priorityMatch && userMatch;
      });
    });

    setFilteredColumns(filtered);
  }, [columns, searchQuery, filterStatus, filterPriority, filterUser]);

  React.useEffect(() => {
    filterTasks();
  }, [filterTasks]);

  const FilterDropdown = () => {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <SlidersHorizontalIcon />
            <span className="hidden lg:inline">
              {getActiveFilters().length > 0 ? (
                <>Filters ({getActiveFilters().length})</>
              ) : (
                "Filters"
              )}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="end">
          <Command>
            <CommandInput placeholder="Search filters..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>

              {/* Status Filters */}
              <CommandGroup heading="Status">
                <CommandItem
                  onSelect={() => {
                    setFilterStatus("completed");
                    setOpen(false);
                  }}>
                  <span>Completed</span>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setFilterStatus("inProgress");
                    setOpen(false);
                  }}>
                  <span>In Progress</span>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setFilterStatus("notStarted");
                    setOpen(false);
                  }}>
                  <span>Not Started</span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              {/* Priority Filters */}
              <CommandGroup heading="Priority">
                <CommandItem
                  onSelect={() => {
                    setFilterPriority("high");
                    setOpen(false);
                  }}>
                  <span>High </span>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setFilterPriority("medium");
                    setOpen(false);
                  }}>
                  <span>Medium </span>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setFilterPriority("low");
                    setOpen(false);
                  }}>
                  <span>Low </span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              {/* User Filters */}
              <CommandGroup heading="Assigned To">
                {Array.from(
                  new Set(
                    Object.values(columns).flatMap((tasks) =>
                      tasks.flatMap((task) => task.users.map((user) => user.name))
                    )
                  )
                ).map((userName) => (
                  <CommandItem
                    key={userName}
                    onSelect={() => {
                      setFilterUser(userName);
                      setOpen(false);
                    }}>
                    <Avatar className="mr-2 h-5 w-5">
                      <AvatarImage
                        src={
                          columns.backlog
                            .find((task) => task.users.some((user) => user.name === userName))
                            ?.users.find((user) => user.name === userName)?.src
                        }
                        alt={userName}
                      />
                      <AvatarFallback>{userName[0]}</AvatarFallback>
                    </Avatar>
                    <span>{userName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />

              {/* Clear Filters */}
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setFilterStatus(null);
                    setFilterPriority(null);
                    setFilterUser(null);
                    setOpen(false);
                  }}
                  className="justify-center text-center">
                  Clear Filters
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  function addColumn(title: string) {
    const id = `col-${Date.now()}`;
    setColumns((prev) => ({
      ...prev,
      [id]: []
    }));
    setColumnTitles((prev) => ({
      ...prev,
      [id]: title
    }));
    setNewColumnTitle("");
    setIsNewColumnModalOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Kanban Board</h1>
        <div className="flex items-center space-x-2">
          <div className="flex -space-x-2 overflow-hidden">
            <Avatar className="border-background border-2">
              <AvatarImage src="/images/avatars/05.png" alt="..." />
              <AvatarFallback>AT</AvatarFallback>
            </Avatar>
            <Avatar className="border-background border-2">
              <AvatarImage src="/images/avatars/04.png" alt="..." />
              <AvatarFallback>AT</AvatarFallback>
            </Avatar>
            <Avatar className="border-background border-2">
              <AvatarImage src="/images/avatars/03.png" alt="..." />
              <AvatarFallback>AT</AvatarFallback>
            </Avatar>
            <Avatar className="border-background border-2">
              <AvatarFallback className="text-xs">+5</AvatarFallback>
            </Avatar>
          </div>
          <AddAssigne />
        </div>
      </div>
      <Tabs defaultValue="board" className="w-full">
        <div className="mb-2 flex justify-between gap-2">
          <TabsList>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <div className="relative hidden w-auto lg:block">
              <SearchIcon className="absolute top-2.5 left-3 size-4 opacity-50" />
              <Input
                placeholder="Search tasks..."
                className="ps-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="none lg:hidden">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <SearchIcon />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-0" align="end">
                  <Input
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <FilterDropdown />

            <Dialog open={isNewColumnModalOpen} onOpenChange={setIsNewColumnModalOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusCircleIcon />
                  <span className="hidden lg:inline">Add Board</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New Board</DialogTitle>
                </DialogHeader>
                <div className="mt-4 flex gap-2">
                  <Input
                    id="name"
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    className="col-span-3"
                    placeholder="Enter board name..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newColumnTitle.trim()) {
                        addColumn(newColumnTitle.trim());
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!newColumnTitle.trim()}
                    onClick={() => addColumn(newColumnTitle.trim())}>
                    <CheckIcon />
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <TabsContent value="board">
          <Kanban.Root
            value={filteredColumns}
            onValueChange={setColumns}
            getItemValue={(item) => item.id}>
            <Kanban.Board className="flex w-full gap-4 overflow-x-auto pb-4">
              {Object.entries(filteredColumns).map(([columnValue, tasks]) => (
                <Kanban.Column
                  key={columnValue}
                  value={columnValue}
                  className="w-[340px] min-w-[340px]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{columnTitles[columnValue]}</span>
                      <Badge variant="outline">{tasks.length}</Badge>
                    </div>
                    <div className="flex">
                      <Kanban.ColumnHandle asChild>
                        <Button variant="ghost" size="icon">
                          <GripVertical className="h-4 w-4" />
                        </Button>
                      </Kanban.ColumnHandle>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <PlusCircleIcon />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Add Task</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  {tasks.length > 0 ? (
                    <div className="flex flex-col gap-2 p-0.5">
                      {tasks.map((task) => (
                        <Kanban.Item key={task.id} value={task.id} asHandle asChild>
                          <Card className="border-0">
                            <CardHeader>
                              <CardTitle className="text-base font-semibold">
                                {task.title}
                              </CardTitle>
                              <CardDescription>
                                Compile competitor landing page designs for inspiration. G..
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="text-muted-foreground flex items-center justify-between text-sm">
                                <div className="flex -space-x-2 overflow-hidden">
                                  {task.users.map((user, index) => (
                                    <Avatar key={index} className="border-background border-2">
                                      <AvatarImage
                                        src={user.src || "/placeholder.svg"}
                                        alt={user.alt}
                                      />
                                      <AvatarFallback>{user.fallback}</AvatarFallback>
                                    </Avatar>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2 rounded-lg border p-1">
                                  <div className="relative size-4">
                                    <svg
                                      className="size-full -rotate-90"
                                      viewBox="0 0 36 36"
                                      xmlns="http://www.w3.org/2000/svg">
                                      <circle
                                        cx="18"
                                        cy="18"
                                        r="16"
                                        fill="none"
                                        className="stroke-current text-gray-200 dark:text-neutral-700"
                                        strokeWidth="2"></circle>
                                      <circle
                                        cx="18"
                                        cy="18"
                                        r="16"
                                        fill="none"
                                        className={cn("stroke-current", {
                                          "text-green-600!": task.progress === 100,
                                          "text-orange-500!":
                                            task.progress > 50 && task.progress < 100
                                        })}
                                        strokeWidth="2"
                                        strokeDasharray={2 * Math.PI * 16}
                                        strokeDashoffset={
                                          2 * Math.PI * 16 -
                                          (2 * Math.PI * 16 * task.progress) / 100
                                        }
                                        strokeLinecap="round"></circle>
                                    </svg>
                                  </div>
                                  {`${task.progress}%`}
                                </div>
                              </div>
                              <Separator />
                              <div className="text-muted-foreground flex items-center justify-between text-sm">
                                <Badge className="capitalize" variant="outline">
                                  {task.priority}
                                </Badge>
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1">
                                    <Paperclip className="h-4 w-4" />
                                    <span>{task.attachments}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <MessageSquare className="h-4 w-4" />
                                    <span>{task.comments}</span>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </Kanban.Item>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col justify-center gap-4 pt-4">
                      <div className="text-muted-foreground text-sm">No task added here.</div>
                      <Button variant="outline">Add Task</Button>
                    </div>
                  )}
                </Kanban.Column>
              ))}
            </Kanban.Board>
            <Kanban.Overlay>
              <div className="bg-primary/10 size-full rounded-md" />
            </Kanban.Overlay>
          </Kanban.Root>
        </TabsContent>
        <TabsContent value="list">List...</TabsContent>
        <TabsContent value="table">Table...</TabsContent>
      </Tabs>
    </div>
  );
}
