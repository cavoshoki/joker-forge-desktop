export {
  validateVariableName,
  validateCustomMessage,
} from "@/lib/validation-utils";

export const validateNumberField = () => ({ isValid: true as const });
export const validateTextField = () => ({ isValid: true as const });
export const validateHexColor = () => ({ isValid: true as const });
export const validateObjectKey = () => ({ isValid: true as const });
