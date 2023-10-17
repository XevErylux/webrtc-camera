"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const html_1 = __importDefault(require("@kitajs/html"));
exports.app = (function () {
    return {
        addDiv: () => html_1.default.createElement("div", null, "Inserted by app.addDiv()"),
    };
})();
