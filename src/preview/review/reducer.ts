import { multiplyBy, normalize } from "@/domain/money/decimal";

import { productBySku } from "../fixtures";

import { canBulkConfirm, type LineState, type ReviewState } from "./model";

/** Every action is local component state only; nothing is sent or stored. */
export type ReviewAction =
  | { type: "assign"; userId: string }
  | { type: "confirmCustomer" }
  | { type: "chooseCustomer"; customerId: string }
  | { type: "confirmField"; key: string; by: string }
  | { type: "editField"; key: string; value: string; by: string }
  | { type: "chooseAlternative"; key: string; value: string; by: string }
  | { type: "setShipTo"; addressId: string }
  | { type: "chooseProduct"; lineNo: number; sku: string }
  | { type: "confirmMatch"; lineNo: number }
  | { type: "setRemember"; lineNo: number; remember: boolean }
  | { type: "applyConversion"; lineNo: number; factor: number; note: string }
  | { type: "choosePrice"; lineNo: number; choice: "po" | "expected" }
  | { type: "confirmQuantity"; lineNo: number }
  | { type: "editQuantity"; lineNo: number; value: string }
  | { type: "confirmLine"; lineNo: number; by: string }
  | { type: "bulkConfirm"; by: string };

function updateLine(
  state: ReviewState,
  lineNo: number,
  change: (line: LineState) => LineState,
): ReviewState {
  return {
    ...state,
    lines: state.lines.map((line) => (line.lineNo === lineNo ? change(line) : line)),
  };
}

function updateField(
  state: ReviewState,
  key: string,
  change: Partial<ReviewState["header"][number]>,
): ReviewState {
  return { ...state, header: state.header.map((f) => (f.key === key ? { ...f, ...change } : f)) };
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "assign":
      return { ...state, assignedTo: action.userId };
    case "confirmCustomer":
      return { ...state, customerConfirmed: state.customerId !== null };
    case "chooseCustomer":
      return { ...state, customerId: action.customerId, customerConfirmed: true, shipToId: null };
    case "confirmField":
      return updateField(state, action.key, { state: "confirmed", by: action.by });
    case "editField": {
      const field = state.header.find((f) => f.key === action.key);
      const fromAi = field?.aiValue !== undefined;
      return updateField(state, action.key, {
        value: action.value,
        state: action.value ? (fromAi ? "edited" : "user_entered") : "missing",
        by: action.by,
      });
    }
    case "chooseAlternative":
      return updateField(state, action.key, {
        value: action.value,
        state: "confirmed",
        by: action.by,
      });
    case "setShipTo":
      return { ...state, shipToId: action.addressId };
    case "chooseProduct":
      return updateLine(state, action.lineNo, (line) => ({
        ...line,
        sku: action.sku,
        method: "manual",
        matchScore: null,
        matchConfirmed: true,
        conversion: null,
        quantity: line.poQuantity,
        priceChoice: null,
        expectedUnitPrice: productBySku(action.sku)?.listPrice ?? null,
        expectedPriceSource: "list_price",
        confirmed: false,
      }));
    case "confirmMatch":
      return updateLine(state, action.lineNo, (line) => ({ ...line, matchConfirmed: true }));
    case "setRemember":
      return updateLine(state, action.lineNo, (line) => ({ ...line, remember: action.remember }));
    case "applyConversion":
      return updateLine(state, action.lineNo, (line) => {
        const decimals = productBySku(line.sku)?.quantityDecimals ?? 0;
        return {
          ...line,
          conversion: { factor: action.factor, note: action.note },
          quantity: normalize(multiplyBy(line.poQuantity, action.factor), decimals),
          quantityState: "edited",
        };
      });
    case "choosePrice":
      return updateLine(state, action.lineNo, (line) => ({ ...line, priceChoice: action.choice }));
    case "confirmQuantity":
      return updateLine(state, action.lineNo, (line) => ({ ...line, quantityState: "confirmed" }));
    case "editQuantity":
      return updateLine(state, action.lineNo, (line) => ({
        ...line,
        quantity: action.value,
        quantityState: "edited",
      }));
    case "confirmLine":
      return updateLine(state, action.lineNo, (line) => ({
        ...line,
        confirmed: true,
        confirmedBy: action.by,
        matchConfirmed: true,
        quantityState: line.quantityState === "suggested" ? "confirmed" : line.quantityState,
      }));
    case "bulkConfirm":
      return {
        ...state,
        lines: state.lines.map((line) =>
          canBulkConfirm(line)
            ? { ...line, confirmed: true, confirmedBy: action.by, quantityState: "confirmed" }
            : line,
        ),
      };
  }
}
