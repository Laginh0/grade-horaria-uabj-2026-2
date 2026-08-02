import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grade Horária 2026.2 | Engenharia de Computação",
  description:
    "Monte sua grade semanal, compare disciplinas e identifique conflitos de horário.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
