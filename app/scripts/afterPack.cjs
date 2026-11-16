const path = require("node:path");
const fs = require("node:fs");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const { appOutDir, packager } = context;
  const exe = path.join(appOutDir, `${packager.appInfo.productFilename}.exe`);
  const projectDir = packager.projectDir;
  const candidates = [
    path.join(appOutDir, "..", ".icon-ico", "icon.ico"),
    path.join(projectDir, "build", "icon.ico"),
  ];
  const icon = candidates.find((file) => fs.existsSync(file));
  if (!fs.existsSync(exe) || !icon) return;
  const { rcedit } = await import("rcedit");
  const { version } = packager.appInfo;
  await rcedit(exe, {
    icon,
    "version-string": {
      ProductName: "Nexus",
      FileDescription: "Nexus",
      CompanyName: "Nexus",
      LegalCopyright: "Nexus",
    },
    "file-version": version,
    "product-version": version,
  });
};
