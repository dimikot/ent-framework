#!/usr/bin/env node
const { execSync } = require("child_process");
const { writeFileSync } = require("fs");

function run(command) {
  console.log(`$ ${command}`);
  execSync(command, { stdio: "inherit" });
}

async function updatePackageJson(org, name) {
  const packageJsonPath = `${__dirname}/../package.json`;
  const oldPackageJson = require(packageJsonPath);
  const npmVersion = execSync(`npm view ${name} version`).toString().trim();

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
    scripts: oldPackageJson.scripts,
    dependencies: {
      [`@${org}/${name}`]: origPackageJson.version,
    },
    repository: {
      type: "git",
      url: `git://github.com/dimikot/${name}`,
    },
  };
  writeFileSync(
    packageJsonPath,
    JSON.stringify(newPackageJson, null, 2) + "\n"
  );

  run("git add package.json");

  let commitError = null;
  try {
    run(`git commit -m "v${newPackageJson.version}"`);
  } catch (e) {
    commitError = e;
  }

  if (!commitError) {
    run("git push");
  }

  if (newPackageJson.version !== npmVersion) {
    run("npm publish");
  }
}

updatePackageJson("clickup", "ent-framework").catch((e) => {
  console.error(e);
  process.exit(1);
});
