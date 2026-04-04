export const detectValueType = (value: unknown): string => {
  if (Array.isArray(value)) {
    return "array";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "string") {
    if (value.startsWith("GAMEVAR:")) {
      return "game_var";
    }
    if (value.startsWith("RANGE:")) {
      return "range_var";
    }
    return "text";
  }

  return "unknown";
};
