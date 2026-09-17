import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
