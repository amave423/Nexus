import { rcedit } from "rcedit";

await rcedit("out/win-unpacked/Nexus.exe", {
  icon: "out/.icon-ico/icon.ico",
  "version-string": {
    ProductName: "Nexus",
    FileDescription: "Nexus",
    CompanyName: "Nexus",
    LegalCopyright: "Nexus",
  },
  "file-version": "0.2.0",
  "product-version": "0.2.0",
});

console.log("icon set");
