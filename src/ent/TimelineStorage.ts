import defaults from "lodash/defaults";
import type { MaybeCallable, PickPartial } from "../internal/misc";
import { VC } from "./VC";

export interface TimelineStorageOptions {
  merge?: (dataStrs: string[]) => string;
  maxChunksPerPrincipal?: MaybeCallable<number>;
}

/**
 * An abstract class that defines the interface for loading and storing
 * timelines per VC principals.
 */
export abstract class TimelineStorage {
  /** Default values for the constructor options. */
  static readonly DEFAULT_OPTIONS: Required<
    PickPartial<TimelineStorageOptions>
  > = {
    merge: (dataStrs: string[]) => {
      const vc = VC.createGuestPleaseDoNotUseCreationPointsMustBeLimited();
      vc.deserializeTimelines(...dataStrs);
      return vc.serializeTimelines()!;
    },
    maxChunksPerPrincipal: 10,
  };

  /** Client configuration options. */
  readonly options: Required<TimelineStorageOptions>;

  /**
   * Loads the timelines from the storage for a given principal.
   */
  abstract load(principal: string): Promise<string[]>;

  /**
   * Saves the timelines in the storage for a given principal.
   */
  abstract save(principal: string, dataStr: string): Promise<void>;

  /**
   * Initializes an instance of TimelineStorage.
   */
  constructor(options: TimelineStorageOptions) {
    this.options = defaults({}, options, TimelineStorage.DEFAULT_OPTIONS);
  }
}
