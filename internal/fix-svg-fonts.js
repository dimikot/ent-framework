#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("fs");
const { readdirSync } = require("fs");

async function main() {
  process.chdir(`${__dirname}/../gitbook/.gitbook/assets`);
  for (const file of readdirSync(".")) {
    if (!file.endsWith(".svg")) {
      continue;
    }

    let content = readFileSync(file, "utf8");
    content = content.replace(/@font-face.*?\}\n/gs, "");
    content = content.replace(/(<style>)\n+/gs, "$1");
    content = content.replace(/DIN Next/g, "Arial");
    writeFileSync(file, content);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
