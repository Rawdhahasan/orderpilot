/**
 * FICTIONAL DEMONSTRATION DATA for the development preview only.
 * Never imported outside src/preview and src/app/preview (lint-enforced).
 */
import * as masterData from "./master-data";
import * as orders from "./orders";
import * as reviews from "./reviews";
import * as selectors from "./selectors";
import * as workspace from "./workspace";

export const FICTIONAL = true as const;

/** Every fixture module, so tests can check that each is labelled fictional. */
export const FIXTURE_MODULES = { workspace, masterData, orders, reviews, selectors } as const;

export * from "./master-data";
export * from "./orders";
export * from "./reviews";
export * from "./selectors";
export * from "./workspace";
export type * from "./types";
