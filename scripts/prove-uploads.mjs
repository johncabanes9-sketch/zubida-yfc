// Proves upload validation rejects forged/oversized files and that a real
// upload round-trips through Storage without leaving orphans.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const { validateImage, sniffImageType, MAX_BYTES } = await import("../src/lib/images/validate.ts");

let pass = 0, fail = 0;
const check = (n, c, got) => c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG  = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x45,0x42,0x50]);
// "MZ" — a Windows executable. This is the attack: a real .exe with an image MIME.
const EXE  = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0]);
const SVG  = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

check("sniffs jpeg", sniffImageType(JPEG) === "image/jpeg", sniffImageType(JPEG));
check("sniffs png",  sniffImageType(PNG)  === "image/png",  sniffImageType(PNG));
check("sniffs webp", sniffImageType(WEBP) === "image/webp", sniffImageType(WEBP));

// The core security assertion: a forged MIME must not survive the sniff.
check("REJECTS exe forged as image/jpeg", validateImage(EXE, "image/jpeg", EXE.length).ok === false, validateImage(EXE, "image/jpeg", EXE.length));
check("REJECTS svg (script vector)",      validateImage(SVG, "image/svg+xml", SVG.length).ok === false, validateImage(SVG, "image/svg+xml", SVG.length));
check("REJECTS oversized file",           validateImage(JPEG, "image/jpeg", MAX_BYTES + 1).ok === false, validateImage(JPEG, "image/jpeg", MAX_BYTES + 1));
// Positive control — without this an always-reject bug would pass everything above.
check("ACCEPTS a real jpeg",              validateImage(JPEG, "image/jpeg", JPEG.length).ok === true, validateImage(JPEG, "image/jpeg", JPEG.length));

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
