import { create } from "zustand";
import { Mail } from "./data";

type MailStore = {
  selectedMail: Mail | null;
  setSelectedMail: (mail: Mail | null) => void;
};

export const useMailStore = create<MailStore>((set) => ({
  selectedMail: null,
  setSelectedMail: (mail) => set({ selectedMail: mail })
}));
