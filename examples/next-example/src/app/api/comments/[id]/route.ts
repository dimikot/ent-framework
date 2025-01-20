import { EntComment } from "@/ents/EntComment";
import { getServerVC } from "@/ents/getServerVC";
import { NextApiRequest } from "next";
import { NextResponse } from "next/server";

export async function GET(
  _req: NextApiRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const vc = await getServerVC();
  const comment = await EntComment.loadX(vc, (await params).id);
  return NextResponse.json({ message: comment.message });
}
