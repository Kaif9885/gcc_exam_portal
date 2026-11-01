import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glorious Coaching Centre | Examination Portal",
  description: "Secure online examination portal for Glorious Coaching Centre.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
