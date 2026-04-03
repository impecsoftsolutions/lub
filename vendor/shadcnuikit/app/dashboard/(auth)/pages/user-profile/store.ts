import { create } from "zustand";

export interface ActivityItem {
  id: string;
  type: "file-upload" | "status-update" | "card-added";
  title: string;
  description: string;
  timestamp: string;
  files?: Array<{ name: string; size: string; type: "excel" | "word" }>;
  badge?: { text: string; color: string };
  cards?: Array<{ id: string; color: string }>;
  link?: { text: string; id: string };
}

export interface Connection {
  id: string;
  name: string;
  avatar?: string;
  initials?: string;
  connections: number;
  status: "connected" | "pending";
  online?: boolean;
}

export interface Team {
  id: string;
  name: string;
  members: number;
}

export interface Project {
  id: string;
  name: string;
  icon: string;
  iconBg: string;
  progress: number;
  hoursSpent: string;
  updated: string;
}

interface ProfileState {
  user: {
    name: string;
    verified: boolean;
    avatar: string;
    role: string;
    location: string;
    joinedDate: string;
    email: string;
    phone: string;
    department: string;
    teams: number;
    projects: number;
    online: boolean;
  };
  profileCompletion: number;
  activities: ActivityItem[];
  connections: Connection[];
  teams: Team[];
  projects: Project[];
}

export const useProfileStore = create<ProfileState>(() => ({
  user: {
    name: "Toby Belhome",
    verified: true,
    avatar:
      "https://images.unsplash.com/photo-1654110455429-cf322b40a906?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OHx8YXZhdGFyfGVufDB8fDB8fHww&auto=format&fit=crop&q=60&w=200",
    role: "Developer",
    location: "San Francisco, US",
    joinedDate: "March 2025",
    email: "hi@shadcnuikit.com",
    phone: "+1 (609) 972-22-22",
    department: "No department",
    teams: 7,
    projects: 8,
    online: true
  },
  profileCompletion: 82,
  activities: [],
  connections: [],
  teams: [],
  projects: []
}));
