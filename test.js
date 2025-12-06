import { processReceipt } from "./processReceipt.js";

(async () => {
  const list = await processReceipt("./test.jpg");
  console.log(list);
})();
