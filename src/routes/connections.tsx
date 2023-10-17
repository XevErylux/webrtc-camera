import Html from "@kitajs/html";

import { Router } from "express";
var router = Router();

/* GET users listing. */
router.get("/", function (req, res, next) {
  const element = (
    <div style={{ fontWeight: "bold" }}>respond with a resource</div>
  );
  res.send(element);
});

export default router;
