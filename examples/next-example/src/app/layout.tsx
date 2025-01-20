import Image from "next/image";
import { Providers } from "@/components/Providers";
import { SignInButton } from "@/components/SignInButton";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
      <body>
        <Providers>
          <div className="min-h-screen max-w-xl mx-auto w-full p-8 sm:p-20 flex items-center">
            <main className="flex flex-col gap-4 row-start-2 items-center sm:items-start w-full">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-4">
                  <Image
                    src="/logo-small.svg"
                    alt="Ent Framework logo"
                    width={48}
                    height={48}
                    priority
                  />
                  <span className="text-xl font-semibold">Ent Framework</span>
                </div>
                <SignInButton />
              </div>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
