"use strict";

const { createRepository } = require("./repository");
const { hashPassword } = require("./security");

async function main() {
  const [loginRaw, password, role = "owner", ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(" ").trim() || "Владелец Чайной истории";
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const login = String(loginRaw || "").trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,30}$/.test(login)) throw new Error("Usage: npm run create-user -- <login> <password> <client|master|admin|owner> <name>");
  if (String(password || "").length < 12) throw new Error("Initial privileged password must be at least 12 characters");
  if (!["client","master","admin","owner"].includes(role)) throw new Error("Unknown role");
  const repo = createRepository(process.env.DATABASE_URL);
  try {
    if (await repo.userByLogin(login)) throw new Error("Login already exists");
    const pass = await hashPassword(password);
    const row = await repo.createUser({ login,name,email:"",salt:pass.salt,hash:pass.hash,avatarColor:"#c4452f",profile:{ title:role==="owner"?"Владелец чайной":"Управляющий чайной", philosophy:"Гость чувствует заботу, команда — ясность." } });
    if (role !== "client") await repo.setRole(row.id,row.id,role);
    process.stdout.write(`Created ${login} (${role})\n`);
  } finally { await repo.close(); }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
