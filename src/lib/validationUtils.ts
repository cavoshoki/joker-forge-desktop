export interface LegacyValidationResult {
  isValid: boolean;
  error?: string;
}

export const validateVariableName = (
  _name: string,
): LegacyValidationResult => ({
  isValid: true,
});

export const validateCustomMessage = (
  _message: string,
): LegacyValidationResult => ({
  isValid: true,
});

export const validateNumberField = (
  _value: unknown,
): LegacyValidationResult => ({
  isValid: true,
});

export const validateTextField = (_value: unknown): LegacyValidationResult => ({
  isValid: true,
});

export const validateHexColor = (_value: unknown): LegacyValidationResult => ({
  isValid: true,
});

export const validateObjectKey = (_value: unknown): LegacyValidationResult => ({
  isValid: true,
});
