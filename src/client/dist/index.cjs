"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target, mod));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var client_exports = {};
__export(client_exports, {
  routes: () => import_routes.default
});
module.exports = __toCommonJS(client_exports);
var import_context = require("./context.js");
__reExport(client_exports, require("@runtime/clientTypes"), module.exports);
__reExport(client_exports, require("./api"), module.exports);
__reExport(client_exports, require("./baseUrl"), module.exports);
__reExport(client_exports, require("./defineLayout"), module.exports);
__reExport(client_exports, require("./head"), module.exports);
__reExport(client_exports, require("./http/get.js"), module.exports);
__reExport(client_exports, require("./hydrate"), module.exports);
__reExport(client_exports, require("./index.dev"), module.exports);
__reExport(client_exports, require("./loadPageState"), module.exports);
__reExport(client_exports, require("./pageClient"), module.exports);
__reExport(client_exports, require("./prependBase"), module.exports);
var import_routes = __toESM(require("./routes"), 1);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  routes
});
//# sourceMappingURL=index.cjs.map