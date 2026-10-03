export const metadata = { title: "Tabellone" };

export default function TabelloneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-black">{children}</div>;
}
