#!/usr/bin/env node
const { execSync } = require("child_process");
const { writeFileSync } = require("fs");

function run(command) {
  console.log(`$ ${command}`);
  execSync(command, { stdio: "inherit" });
}

async function updatePackageJson(org, name) {
  const packageJsonPath = `${__dirname}/../package.json`;
  const npmVersion = execSync(`npm view ${name} version`).toString().trim();

  const orgPackageJson = await fetch(
    `https://raw.githubusercontent.com/${org}/${name}/refs/heads/main/package.json`
  ).then((res) => res.json());

  const packageJson = require(packageJsonPath);
  packageJson.name = name;
  packageJson.description = orgPackageJson.description;
  packageJson.version = orgPackageJson.version;
  packageJson.keywords = orgPackageJson.keywords;
  packageJson.dependencies = {
    [`@${org}/${name}`]: orgPackageJson.version,
  };
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");

  run("git add package.json");

  let commitError = null;
  try {
    run(`git commit -m "v${packageJson.version}"`);
  } catch (e) {
    commitError = e;
  }

  if (!commitError) {
    run("git push");
  }

  if (packageJson.version !== npmVersion) {
    run("npm publish");
  }
}

updatePackageJson("clickup", "ent-framework").catch((e) => {
  console.error(e);
  process.exit(1);
});
