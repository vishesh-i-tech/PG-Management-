"use client";

import { SerwistProvider } from "@serwist/next/react";
import type { ReactNode } from "react";

export function PWAProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      register={process.env.NODE_ENV === "production"}
      reloadOnOnline
    >
      {children}
    </SerwistProvider>
  );
}
