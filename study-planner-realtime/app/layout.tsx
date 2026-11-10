import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./style.css";
export const metadata: Metadata = {
  title: "Valeska's Study Planner",
  description: "Personal study planner with two-way Notion sync, smart rescheduling, and reminders.",
  manifest: "/manifest.webmanifest",
  themeColor: "#f5f3ee",
  icons: { icon: "/icon-192.png" }
};
export default function RootLayout({children}:{children:ReactNode}) {
  return <html lang="id"><body>{children}</body></html>;
}
