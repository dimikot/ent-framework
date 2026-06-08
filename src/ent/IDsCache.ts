import QuickLRU from "quick-lru";
import { objectId } from "../internal/objectId";

const SEP = ":";

interface EntClassAlike {
  SCHEMA: object;
}

export abstract class IDsCache {
  private ids = new QuickLRU<string, boolean>({ maxSize: 2000 });

  has(Ent: EntClassAlike, id: string): boolean {
    return this.ids.has(objectId(Ent) + SEP + id);
  }

  add(Ent: EntClassAlike, id: string, value: boolean = true): void {
    this.ids.set(objectId(Ent) + SEP + id, value);
  }

  get(Ent: EntClassAlike, id: string): boolean | undefined {
    return this.ids.get(objectId(Ent) + SEP + id);
  }
}
