"use client";

import { createContext, useContext } from "react";

/** Lets the chat view refresh the sidebar list without router.refresh() (which would remount the page). */
export const HistoryContext = createContext<{ reload: () => Promise<void> }>({
  reload: async () => {},
});

export const useHistoryReload = () => useContext(HistoryContext).reload;
