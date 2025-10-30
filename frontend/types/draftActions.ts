export type Draft = { amount: number; symbol: string }

export type DraftAction =
  | { amount: number; idx: number; side: "borrows" | "deposits"; type: "update" }
  | { idx: number; side: "borrows" | "deposits"; type: "remove" }
  | { side: "borrows" | "deposits"; symbol: string; type: "add" }
  | { type: "clear" }

export interface DraftState {
  borrows: Draft[]
  deposits: Draft[]
}

export const draftReducer = (state: DraftState, action: DraftAction): DraftState => {
  const next = { ...state }
  switch (action.type) {
    case "add":
      next[action.side] = [...next[action.side], { amount: 0, symbol: action.symbol }]
      return next
    case "clear":
      return { borrows: [], deposits: [] }
    case "remove":
      next[action.side] = next[action.side].filter((_, i) => i !== action.idx)
      return next
    case "update":
      next[action.side] = next[action.side].map((d, i) =>
        i === action.idx ? { ...d, amount: action.amount } : d,
      )
      return next
    default:
      return state
  }
}
