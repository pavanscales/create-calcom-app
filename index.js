#!/usr/bin/env node

import { execa } from "execa";
import simpleGit from "simple-git";
import fs from "fs";
import prompts from "prompts";
import crypto from "crypto";

async function generateRandomKey(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64");
}

async function main() {
  const projectName = "cal.com";
  const git = simpleGit();

  if (!fs.existsSync(projectName)) {
    console.log(`⏳ Cloning Cal.com into ./${projectName}...`);
    try {
      await git.clone("https://github.com/calcom/cal.com.git", projectName);
    } catch (err) {
      console.error("❌ Git clone failed:", err);
      process.exit(1);
    }
  } else {
    console.log(`✅ "${projectName}" folder exists. Skipping clone.`);
  }

  process.chdir(projectName);

  const dbAnswers = await prompts([
    { type: "text", name: "dbUser", message: "Postgres username:", initial: "postgres" },
    { type: "password", name: "dbPassword", message: "Postgres password:" },
    { type: "text", name: "dbHost", message: "Postgres host:", initial: "localhost" },
    { type: "number", name: "dbPort", message: "Postgres port:", initial: 5432 },
    { type: "text", name: "dbName", message: "Postgres database name:", initial: "calcom" },
  ]);

  console.log("\n📦 Installing dependencies...");
  await execa("yarn", [], { stdio: "inherit" });

  console.log("\n📄 Setting up .env files...");

  if (fs.existsSync(".env.example")) {
    if (!fs.existsSync(".env")) {
      fs.copyFileSync(".env.example", ".env");
      console.log("✅ Copied .env.example to .env");
    } else {
      console.log(".env already exists. Skipping copy.");
    }
  } else {
    console.warn("⚠️ .env.example not found! Creating minimal .env file.");
    if (!fs.existsSync(".env")) {
      fs.writeFileSync(".env", `# Minimal .env created by setup script\nNEXTAUTH_URL=http://localhost:3000\n`);
    }
  }

  if (fs.existsSync(".env.appStore.example")) {
    if (!fs.existsSync(".env.appStore")) {
      fs.copyFileSync(".env.appStore.example", ".env.appStore");
      console.log("✅ Copied .env.appStore.example to .env.appStore");
    } else {
      console.log(".env.appStore already exists. Skipping copy.");
    }
  } else {
    console.warn("⚠️ .env.appStore.example not found! Skipping .env.appStore creation.");
  }

  const NEXTAUTH_SECRET = await generateRandomKey(32);
  const CALENDSO_ENCRYPTION_KEY = await generateRandomKey(24);

  const dbUrl = `postgresql://${dbAnswers.dbUser}:${encodeURIComponent(
    dbAnswers.dbPassword
  )}@${dbAnswers.dbHost}:${dbAnswers.dbPort}/${dbAnswers.dbName}`;

  let env = fs.readFileSync(".env", "utf-8");
  const replacements = {
    NEXTAUTH_SECRET,
    DATABASE_URL: dbUrl,
    CALENDSO_ENCRYPTION_KEY,
    NEXTAUTH_URL: "http://localhost:3000",
    NEXT_PUBLIC_DEBUG: "1",
    E2E_TEST_MAILHOG_ENABLED: "1",
  };

  for (const [key, val] of Object.entries(replacements)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    env = env.match(regex) ? env.replace(regex, `${key}=${val}`) : env + `\n${key}=${val}`;
  }

  fs.writeFileSync(".env", env);
  console.log("✅ Updated .env with database and secrets.");

  console.log("\n🛠️ Deploying database schema with Prisma...");
  await execa("yarn", ["workspace", "@calcom/prisma", "db-deploy"], { stdio: "inherit" });

  const { useDocker } = await prompts({
    type: "toggle",
    name: "useDocker",
    message: "Use Docker for faster setup and local Postgres with test users (yarn dx)?",
    initial: true,
    active: "yes",
    inactive: "no",
  });

  if (useDocker) {
    console.log("\n🐳 Starting dev server with Docker (yarn dx)...");
    await execa("yarn", ["dx"], { stdio: "inherit" });
  } else {
    console.log("\n🚀 Starting dev server (yarn dev)...");
    await execa("yarn", ["dev"], { stdio: "inherit" });
  }

  console.log("\n🎉 Setup complete! Visit http://localhost:3000 to access Cal.com.");
}

main().catch((err) => {
  console.error("❌ Setup failed:", err);
  process.exit(1);
});
