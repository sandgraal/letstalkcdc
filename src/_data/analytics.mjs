// Visit counting (GoatCounter, P15-10): off unless GOATCOUNTER_CODE is set at
// build time to a valid site code. Only a default export here: Eleventy would
// nest the data under "default" if this file had named exports.
import { readGoatcounterCode } from "../../lib/goatcounter-code.mjs";

export default {
  goatcounterCode: readGoatcounterCode(process.env.GOATCOUNTER_CODE),
};
