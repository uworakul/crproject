import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ABC CO., LTD. — HR & Payroll",
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
