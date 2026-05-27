import { Inter } from "next/font/google";
import { Provider } from "@/components/provider";
import "./global.css";
import type { Metadata } from "next";

const inter = Inter({
  subsets: ["latin"],
});

const title = "temporal97";
const description =
  "A TypeScript temporal graph with snapshot-based time travel and mutation history tracking.";
const url = "https://joehentges.github.io/temporal97";

export const metadata: Metadata = {
  title: {
    default: title,
    template: `%s | ${title}`,
  },
  description,
  keywords: [
    "temporal graph",
    "time travel",
    "graph data structure",
    "TypeScript",
    "mutation history",
    "snapshot",
  ],
  authors: [{ name: "Joe Hentges", url: "https://github.com/joehentges" }],
  creator: "Joe Hentges",
  openGraph: {
    type: "website",
    locale: "en_US",
    url,
    title,
    description,
    siteName: title,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
