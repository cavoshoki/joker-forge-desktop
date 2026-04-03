export interface UserVariableOption {
  value: string;
  label: string;
  valueType?: string;
}

export interface UserVariableUsage {
  variableName: string;
  ruleIndex: number;
  fieldPath: string;
}

export const getAllVariables = () => [] as Array<{ name: string }>;
export const getNumberVariables = () => [] as Array<{ name: string }>;

export const addSuitVariablesToOptions = (options: UserVariableOption[]) =>
  options;
export const addRankVariablesToOptions = (options: UserVariableOption[]) =>
  options;
export const addPokerHandVariablesToOptions = (options: UserVariableOption[]) =>
  options;
export const addNumberVariablesToOptions = (options: UserVariableOption[]) =>
  options;
export const addKeyVariablesToOptions = (options: UserVariableOption[]) =>
  options;
export const addTextVariablesToOptions = (options: UserVariableOption[]) =>
  options;

export const getVariableUsageDetails = () => [] as UserVariableUsage[];
