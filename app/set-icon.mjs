import { rcedit } from "rcedit";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

await rcedit("out/win-unpacked/Nexus.exe", {
  icon: "out/.icon-ico/icon.ico",
  "version-string": {
    ProductName: "Nexus",
    FileDescription: "Nexus",
    CompanyName: "Nexus",
    LegalCopyright: "Nexus",
  },
  "file-version": version,
  "product-version": version,
});

console.log("icon set");
