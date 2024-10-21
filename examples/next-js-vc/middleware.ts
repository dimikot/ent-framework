import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { EntUser } from "./ents/EntUser";
import { VC } from "ent-framework";

const rootVC = VC.createGuestPleaseDoNotUseCreationPointsMustBeLimited();

declare global {
  interface Request {
    // This adds Request#vc property to all Express Request objects.
    vc: VC;
  }
}

export async function middleware(request: NextRequest) {
  const user = await EntUser.loadNullable(rootVC.toOmniDangerous(), "1");
  console.log(user);
  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
