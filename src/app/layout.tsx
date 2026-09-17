import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";

// Matches the clean geometric-sans look of the reference screenshot's font.
const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-prompt",
});

export const metadata: Metadata = {
  title: "CRPAYROLL — ABC CO., LTD.",
  description: "ระบบ HR & Payroll สำหรับ ABC CO., LTD.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={prompt.variable}>
      <body>{children}</body>
    </html>
  );
}
