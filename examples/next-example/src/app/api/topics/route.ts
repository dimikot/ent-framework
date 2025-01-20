import { EntComment } from "@/ents/EntComment";
import { EntTopic } from "@/ents/EntTopic";
import { EntUser } from "@/ents/EntUser";
import { getServerVC } from "@/ents/getServerVC";
import { NextApiRequest } from "next";
import { NextResponse } from "next/server";

export async function POST(req: NextApiRequest) {
  const vc = await getServerVC();
  const user = await EntUser.loadX(vc, vc.principal);
  const topic = await EntTopic.insertReturning(vc, {
    slug: `t${Date.now()}`,
    creator_id: user.id,
    subject: String(req.body.subject || "My Topic"),
  });
  const commentID = await EntComment.insert(topic.vc, {
    topic_id: topic.id,
    creator_id: user.id,
    message: String(req.body.subject || "My Message"),
  });
  return NextResponse.json({
    message: `Created topic ${topic.id} and comment ${commentID}`,
  });
}
