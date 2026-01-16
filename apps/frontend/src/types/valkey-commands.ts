export interface ValkeyParameter {
  name: string;
  type: "key" | "value" | "option" | "number" | "pattern" | "cursor";
  required: boolean;
  placeholder?: string;
  repeatable?: boolean;
}

export interface ValkeyCommand {
  name: string;
  syntax: string;
  category: string;
  description: string;
  parameters: ValkeyParameter[];
  tier: "default" | "remediation" | "admin";
}

export interface MatchResult {
  command: ValkeyCommand;
  score: number;
  matchType: "prefix" | "contains" | "fuzzy";
  highlightRanges: Array<[number, number]>;
}
