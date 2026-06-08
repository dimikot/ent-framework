/* eslint-disable @typescript-eslint/no-explicit-any */
import { Timeline } from "../../abstract";
import { TimelineStorage } from "../TimelineStorage";
import { VC } from "../VC";
import { VCFlavor } from "../VCFlavor";
import { createVC } from "./test-utils";

class Cache extends Map<unknown, unknown> {
  constructor() {
    super([]);
  }
}

class VCTest1 extends VCFlavor {
  constructor(public value: string) {
    super();
  }

  override toDebugString(): string {
    return `VCTest1:${this.value}`;
  }
}

class VCTest2 extends VCFlavor {
  constructor(public value: string) {
    super();
  }

  override toDebugString(): string {
    return `VCTest2:${this.value}`;
  }
}

class TestTimelineStorage extends TimelineStorage {
  private db = new Map<string, string[]>();

  override async load(principal: string): Promise<string[]> {
    return this.db.get(principal) ?? [];
  }

  override async save(principal: string, dataStr: string): Promise<void> {
    this.db.set(principal, [dataStr]);
  }
}

test("VC should be able to clone", () => {
  const vc1 = createVC();
  vc1.cache(Cache).set("test", 42);
  const vc2: VC = Object.assign(Object.create(VC.prototype), vc1);
  expect(vc2.cache(Cache).get("test")).toEqual(42);
});

test("root flag of the VC is changed", () => {
  const vc1root = createVC() as VC;
  expect((vc1root as any).isRoot).toBeTruthy();

  const vc2root = vc1root.toOmniDangerous();
  expect((vc2root as any).isRoot).toBeTruthy();
  expect(
    (vc2root as any).timelines === (vc1root as any).timelines,
  ).toBeTruthy();

  const vc3 = vc1root.toLowerInternal("42");
  expect((vc3 as any).isRoot).toBeFalsy();
  expect((vc3 as any).timelines === (vc1root as any).timelines).toBeFalsy();

  const vc4 = vc2root.toLowerInternal("42");
  expect((vc4 as any).isRoot).toBeFalsy();
  expect((vc4 as any).timelines === (vc2root as any).timelines).toBeFalsy();

  const vc5 = vc4.toLowerInternal(null); // -> guest
  expect((vc5 as any).isRoot).toBeFalsy();
  expect((vc5 as any).timelines === (vc4 as any).timelines).toBeTruthy();

  const vc6 = vc5.toLowerInternal("11"); // -> other user
  expect((vc6 as any).isRoot).toBeFalsy();
  expect((vc6 as any).timelines === (vc5 as any).timelines).toBeTruthy();
});

test("VC flavor prepend and append", () => {
  const vc = createVC().withFlavor(new VCTest1("some"));
  const vc2 = vc.withFlavor(new VCTest2("t2"));
  expect(vc2.toString()).toEqual("vc:guest(VCTest1:some,VCTest2:t2)");
  expect(vc2.withFlavor(new VCTest2("tNew")).toString()).toEqual(
    "vc:guest(VCTest1:some,VCTest2:tNew)",
  );
  expect(vc2.withFlavor("prepend", new VCTest2("tNew")).toString()).toEqual(
    "vc:guest(VCTest2:tNew,VCTest1:some)",
  );
});

describe("VC.withoutFlavor", () => {
  test("VC withoutFlavor removes single flavor", () => {
    const vc = createVC()
      .withFlavor(new VCTest1("test1"))
      .withFlavor(new VCTest2("test2"));
    const vcCopy = vc.withoutFlavor(VCTest1);

    expect(vcCopy.flavor(VCTest1)).toBeNull();
    expect(vcCopy.flavor(VCTest2)).toBeInstanceOf(VCTest2);
  });

  test("VC withoutFlavor removes multiple flavors", () => {
    const vc = createVC()
      .withFlavor(new VCTest1("test1"))
      .withFlavor(new VCTest2("test2"));
    const vcCopy = vc.withoutFlavor(VCTest1, VCTest2);

    expect(vcCopy.flavor(VCTest1)).toBeNull();
    expect(vcCopy.flavor(VCTest2)).toBeNull();
  });

  test("VC withoutFlavor returns same instance when no flavors removed", () => {
    const vc = createVC().withFlavor(new VCTest1("test1"));
    const vcCopy = vc.withoutFlavor(VCTest2);

    expect(vcCopy).toBe(vc);
  });

  test("VC withoutFlavor returns same instance when no flavor classes provided", () => {
    const vc = createVC().withFlavor(new VCTest1("test1"));
    const vcCopy = vc.withoutFlavor();

    expect(vcCopy).toBe(vc);
  });

  test("VC withoutFlavor handles non-existent flavor gracefully", () => {
    const vc = createVC();
    const vcCopy = vc.withoutFlavor(VCTest1);

    expect(vcCopy).toBe(vc);
    expect(vcCopy.flavor(VCTest1)).toBeNull();
  });

  test("VC withoutFlavor should not mutate the original VC", () => {
    const vc = createVC().withFlavor(new VCTest1("test1"));
    const vcCopy = vc.withoutFlavor(VCTest1);

    expect(vcCopy).not.toBe(vc);
    expect(vc.flavor(VCTest1)).toBeInstanceOf(VCTest1);
  });
});

test("VC saves and loads timelines", async () => {
  let vc = createVC()
    .toLowerInternal("test")
    .deserializeTimelines(
      JSON.stringify({
        "42:tbl": new Timeline({
          pos: BigInt(1),
          expiresAt: Number.MAX_SAFE_INTEGER,
        }).serialize(),
      }),
    );
  const storage = new TestTimelineStorage({
    merge: (dataStrs) => dataStrs.join(";"),
  });
  const spySave = jest.spyOn(storage, "save");
  const spyLoad = jest.spyOn(storage, "load");
  await vc.saveTimelines(storage);
  await vc.saveTimelines(storage);
  expect(spySave).toHaveBeenCalledTimes(1);
  expect(spySave).toHaveBeenCalledWith(
    "test",
    '{"42:tbl":"1:9007199254740991"}',
  );
  spySave.mockReset();

  vc = createVC().toLowerInternal("test");
  await vc.loadTimelines(storage);
  expect(spyLoad).toHaveBeenCalledWith("test");
  await vc.saveTimelines(storage);
  expect(spySave).toHaveBeenCalledTimes(0);
});

test("non-logged VC cannot save timelines", async () => {
  let vc = createVC();
  const storage = new TestTimelineStorage({
    merge: (dataStrs) => dataStrs.join(";"),
  });
  await expect(vc.saveTimelines(storage)).rejects.toThrow(
    "One does not simply save timelines for a non-logged VC: vc:guest",
  );
  vc = vc.toOmniDangerous();
  await expect(vc.loadTimelines(storage)).rejects.toThrow(
    "One does not simply load timelines for a non-logged VC: vc:omni",
  );
});
