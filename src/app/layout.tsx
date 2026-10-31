import type { Metadata } from "next";
import { RouteHistoryControls } from "@/components/RouteHistoryControls";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glorious Coaching Centre | Examination Portal",
  description: "Secure online examination portal for Glorious Coaching Centre.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><RouteHistoryControls/>{children}</body></html>;
}
