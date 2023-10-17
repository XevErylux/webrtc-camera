"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const html_1 = __importDefault(require("@kitajs/html"));
const express_1 = require("express");
var router = (0, express_1.Router)();
/* GET users listing. */
router.get("/", function (req, res, next) {
    const element = (html_1.default.createElement("div", { style: { fontWeight: "bold" } }, "respond with a resource"));
    res.send(element);
});
exports.default = router;
