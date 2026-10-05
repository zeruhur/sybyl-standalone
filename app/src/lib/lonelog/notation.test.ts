import { describe, expect, it } from "vitest";
import { isDiceExpression } from "./diceNotation";
import { isCardToken } from "./cardNotation";

describe("isDiceExpression", () => {
  it.each(["d6", "2d6", "3d6+2", "1d20-1", "d%", "4dF", "4dF.1", "4d6kh3", "2d20kl1", "4d6dl1", "3d6!", "5d6!>=5", "6d10>=7", "6d10>=7f=1"])(
    "accepts %s",
    (expr) => expect(isDiceExpression(expr)).toBe(true)
  );

  it.each(["", "d", "6", "2x6", "2d6+", "hello", "d6 extra"])("rejects %j", (expr) => expect(isDiceExpression(expr)).toBe(false));
});

describe("isCardToken", () => {
  it.each(["Ah", "10s", "Qd", "Jkr", "RJkr", "R", "M0", "M21", "M13r", "AWa", "PgCu", "KnSw", "10Per"])("accepts %s", (token) =>
    expect(isCardToken(token)).toBe(true)
  );

  it.each(["1h", "11s", "M22", "Zz", "AWar1", "Ax"])("rejects %s", (token) => expect(isCardToken(token)).toBe(false));
});
