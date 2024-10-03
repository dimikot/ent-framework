#!/usr/bin/env node
const { execSync } = require("child_process");
const { writeFileSync } = require("fs");

async function updatePackageJson(org, name) {
  const origPackageJson = await fetch(
    `https://raw.githubusercontent.com/${org}/${name}/refs/heads/main/package.json`
  ).then((res) => res.json());
  const newPackageJson = {
    name,
    description: origPackageJson.description,
    version: origPackageJson.version,
    license: origPackageJson.license,
    keywords: origPackageJson.keywords,
    main: origPackageJson.main,
    types: origPackageJson.types,
    exports: origPackageJson.exports,
    scripts: {
      clean: "rm -rf node_modules package-lock.json yarn.lock pnpm-lock.yaml",
      deploy: `git pull --rebase && bin/update-package-json.js && git push && npm publish`,
    },
    dependencies: {
      [`@${org}/${name}`]: origPackageJson.version,
    },
    repository: {
      type: "git",
      url: `git://github.com/dimikot/${name}`,
    },
  };
  writeFileSync(
    `${__dirname}/../package.json`,
    JSON.stringify(newPackageJson, null, 2) + "\n"
  );

  execSync("git add package.json", { stdio: "inherit" });
  execSync(`git commit -m "v${origPackageJson.version}"`, { stdio: "inherit" });
}

updatePackageJson("clickup", "ent-framework").catch(console.error);
