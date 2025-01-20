import { VC } from "ent-framework";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { EntUser } from "./EntUser";

const vcStore = new WeakMap<object, VC>();

export async function getServerVC(): Promise<VC> {
  const [heads, session] = await Promise.all([headers(), getServerSession()]);
  let vc = vcStore.get(heads);
  if (!vc) {
    vc = VC.createGuestPleaseDoNotUseCreationPointsMustBeLimited();
    if (session?.user?.email) {
      const vcOmni = vc.toOmniDangerous();
      let user = await EntUser.loadByNullable(vcOmni, {
        email: session.user.email,
      });
      if (!user) {
        // User did not exist: upsert the Ent.
        await EntUser.insertIfNotExists(vcOmni, {
          email: session.user.email,
          is_admin: false,
        });
        user = await EntUser.loadByX(vcOmni, {
          email: session.user.email,
        });
      }
      // Thanks to EntUser's privacyInferPrincipal rule, user.vc is
      // automatically assigned to a new derived VC with principal equals to
      // user.id.
      vc = user.vc;
    }
    vcStore.set(heads, vc);
  }
  return vc;
}
