import { getServerVC } from "@/ents/getServerVC";
import { getServerSession } from "next-auth";

export default async function Home() {
  const session = await getServerSession();
  const vc = await getServerVC();
  return (
    <>
      {session ? (
        <div>
          Welcome, {session.user?.name}!<br />
          Your vc.principal={vc.principal}.
        </div>
      ) : (
        <div>Please sign in to continue.</div>
      )}
      <ol className="list-inside list-decimal">
        <li>
          Get started by editing <code>src/app/page.tsx</code>
        </li>
        <li>Save and see your changes instantly.</li>
      </ol>

      <div>
        <a
          className="text-blue-600 hover:underline cursor-pointer"
          href="https://ent-framework.net/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Read Ent Framework docs
        </a>
      </div>
    </>
  );
}
